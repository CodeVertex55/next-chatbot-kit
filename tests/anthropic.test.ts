import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMessageParams, createAnthropicClient, type ReplyRequest } from "@/chat/anthropic";
import { FALLBACK_BETA } from "@/chat/model";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  stream: vi.fn(),
  betaStream: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { stream: mocks.stream };
    beta = { messages: { stream: mocks.betaStream } };
    constructor(options: unknown) {
      mocks.construct(options);
    }
  },
}));

function request(model: string): ReplyRequest {
  return {
    model,
    system: "System text",
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 300,
  };
}

const system = [{ type: "text", text: "System text", cache_control: { type: "ephemeral" } }];
const messages = [{ role: "user", content: "Hello" }];

describe("buildMessageParams", () => {
  it("builds the full set for a fallback-capable model", () => {
    expect(buildMessageParams(request("claude-opus-5-5"))).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 300,
      system,
      messages,
      output_config: { effort: "low" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
  });

  it("builds effort without fallbacks for an unknown model", () => {
    expect(buildMessageParams(request("claude-other-1"))).toEqual({
      model: "claude-other-1",
      max_tokens: 300,
      system,
      messages,
      output_config: { effort: "low" },
    });
  });

  it("builds neither for a Haiku model", () => {
    expect(buildMessageParams(request("claude-haiku-4-5"))).toEqual({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system,
      messages,
    });
  });

  it.each(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5", "claude-other-1"])(
    "never sets thinking or sampling keys for %s",
    (model) => {
      const keys = Object.keys(buildMessageParams(request(model)));
      for (const forbidden of ["thinking", "temperature", "top_p", "top_k"]) {
        expect(keys).not.toContain(forbidden);
      }
    },
  );
});

function fakeSdkStream(events: unknown[], final: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    finalMessage: () => (final instanceof Error ? Promise.reject(final) : Promise.resolve(final)),
  };
}

const textEvent = (text: string) => ({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text },
});

const finalMessage = {
  stop_reason: "end_turn",
  model: "claude-opus-5-5",
  usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 5 },
};

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of source) out.push(chunk);
  return out;
}

describe("createAnthropicClient", () => {
  beforeEach(() => {
    mocks.construct.mockReset();
    mocks.stream.mockReset();
    mocks.betaStream.mockReset();
  });

  it("passes the key to the SDK", () => {
    createAnthropicClient("test-key");
    expect(mocks.construct).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 60_000,
      maxRetries: 1,
    });
  });

  it("uses the beta endpoint for a fallback-capable model", async () => {
    mocks.betaStream.mockReturnValue(fakeSdkStream([textEvent("Hi")], finalMessage));
    const controller = new AbortController();
    const client = createAnthropicClient("test-key");
    const reply = client.stream({ ...request("claude-opus-5-5"), signal: controller.signal });

    expect(await collect(reply.textChunks)).toEqual(["Hi"]);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.betaStream).toHaveBeenCalledTimes(1);
    const [params, options] = mocks.betaStream.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(params).toEqual(buildMessageParams(request("claude-opus-5-5")));
    expect(options).toEqual({ signal: controller.signal });
  });

  it("uses the standard endpoint otherwise", async () => {
    mocks.stream.mockReturnValue(fakeSdkStream([textEvent("Hi")], finalMessage));
    const client = createAnthropicClient("test-key");
    const reply = client.stream(request("claude-haiku-4-5"));

    expect(await collect(reply.textChunks)).toEqual(["Hi"]);
    expect(mocks.betaStream).not.toHaveBeenCalled();
    const [params] = mocks.stream.mock.calls[0] as [Record<string, unknown>];
    expect(params).toEqual(buildMessageParams(request("claude-haiku-4-5")));
  });

  it("yields only text deltas", async () => {
    mocks.stream.mockReturnValue(
      fakeSdkStream(
        [
          { type: "message_start", message: {} },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          textEvent("One "),
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "x" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: "{" },
          },
          textEvent("two"),
          { type: "message_stop" },
        ],
        finalMessage,
      ),
    );
    const reply = createAnthropicClient("k").stream(request("claude-haiku-4-5"));
    expect(await collect(reply.textChunks)).toEqual(["One ", "two"]);
  });

  it("maps the final message to an outcome", async () => {
    mocks.stream.mockReturnValue(fakeSdkStream([], finalMessage));
    const reply = createAnthropicClient("k").stream(request("claude-haiku-4-5"));
    await expect(reply.done).resolves.toEqual({
      stopReason: "end_turn",
      model: "claude-opus-5-5",
      usage: { input: 11, output: 7, cacheRead: 5 },
    });
  });

  it("treats a missing cache read count as zero", async () => {
    mocks.stream.mockReturnValue(
      fakeSdkStream([], {
        ...finalMessage,
        usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: null },
      }),
    );
    const reply = createAnthropicClient("k").stream(request("claude-haiku-4-5"));
    await expect(reply.done).resolves.toMatchObject({ usage: { cacheRead: 0 } });
  });

  it("never leaves a rejected done unhandled", async () => {
    mocks.stream.mockReturnValue(fakeSdkStream([], new Error("boom")));
    const reply = createAnthropicClient("k").stream(request("claude-haiku-4-5"));
    // Wait so that an unhandled rejection would be reported before done is read.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(reply.done).rejects.toThrow("boom");
  });
});
