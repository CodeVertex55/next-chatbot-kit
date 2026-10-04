import { describe, expect, it, vi } from "vitest";
import type { ChatModelClient, ReplyOutcome, ReplyRequest } from "@/chat/anthropic";
import { DailyBudget } from "@/chat/budget";
import { createChatHandler, type ChatHandlerDeps } from "@/chat/handlers/chat";
import { buildSystemPrompt } from "@/chat/knowledge";
import { DEFAULT_MODEL } from "@/chat/model";
import { fallbackReply, holdingReply, interruptedSuffix } from "@/chat/replies";
import type { RateLimitStore } from "@/chat/rate-limit";
import { testConfig, testContent } from "./fixtures";

const ORIGIN = "https://testloaf.example";
const URL = `${ORIGIN}/api/chat`;
const SECRET_TEXT = "my-private-question-text";

const defaultOutcome: ReplyOutcome = {
  stopReason: "end_turn",
  model: "claude-opus-5-5",
  usage: { input: 120, output: 30, cacheRead: 100 },
};

interface FakeOptions {
  chunks?: string[];
  outcome?: Partial<ReplyOutcome>;
  /** Throw this error after this many chunks have been yielded. */
  error?: { after: number; value: unknown };
  /** Reject the final outcome while the text stream ends normally. */
  doneError?: unknown;
}

interface FakeClient extends ChatModelClient {
  requests: ReplyRequest[];
}

function fakeClient(options: FakeOptions = {}): FakeClient {
  const requests: ReplyRequest[] = [];
  const chunks = options.chunks ?? ["Hello", " there."];
  return {
    requests,
    stream(request) {
      requests.push(request);
      const done: Promise<ReplyOutcome> =
        options.error !== undefined
          ? Promise.reject(options.error.value)
          : options.doneError !== undefined
            ? Promise.reject(options.doneError)
            : Promise.resolve({ ...defaultOutcome, ...options.outcome });
      done.catch(() => undefined);
      async function* textChunks(): AsyncGenerator<string> {
        for (const [index, chunk] of chunks.entries()) {
          if (options.error !== undefined && index === options.error.after) {
            throw options.error.value;
          }
          yield chunk;
        }
      }
      return { textChunks: textChunks(), done };
    },
  };
}

function body(messages: unknown = [{ role: "user", content: "Hi" }]): string {
  return JSON.stringify({ messages });
}

function makeRequest(
  init: { body?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Request {
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": "203.0.113.9",
      ...init.headers,
    },
    body: init.body ?? body(),
  };
  if (init.signal !== undefined) requestInit.signal = init.signal;
  return new Request(URL, requestInit);
}

function setup(overrides: Partial<ChatHandlerDeps> = {}, client: ChatModelClient = fakeClient()) {
  const logs: string[] = [];
  const createClient = vi.fn<(apiKey: string) => ChatModelClient>(() => client);
  const handler = createChatHandler({
    content: testContent,
    config: testConfig,
    env: { ANTHROPIC_API_KEY: "test-key" },
    createClient,
    log: (line) => logs.push(line),
    ...overrides,
  });
  return { handler, logs, createClient };
}

describe("request checks", () => {
  it("returns 415 for a wrong content type", async () => {
    const { handler } = setup();
    const res = await handler(makeRequest({ headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
  });

  it("returns 413 for an oversized body", async () => {
    const { handler } = setup();
    const big = body([{ role: "user", content: "x".repeat(70000) }]);
    const res = await handler(makeRequest({ body: big }));
    expect(res.status).toBe(413);
  });

  it("returns 400 for malformed JSON", async () => {
    const { handler } = setup();
    const res = await handler(makeRequest({ body: "{not json" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns 403 for a foreign or missing origin", async () => {
    const { handler, createClient } = setup();
    const foreign = await handler(makeRequest({ headers: { origin: "https://evil.example" } }));
    expect(foreign.status).toBe(403);

    const missing = new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body(),
    });
    expect((await handler(missing)).status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("accepts an origin listed in CHAT_ALLOWED_ORIGINS", async () => {
    const { handler } = setup({
      env: { ANTHROPIC_API_KEY: "k", CHAT_ALLOWED_ORIGINS: "https://other.example" },
    });
    const res = await handler(makeRequest({ headers: { origin: "https://other.example" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-chat-mode")).toBe("live");
    await res.text();
  });

  it("returns 429 with Retry-After once the limit is passed", async () => {
    const config = { ...testConfig, limits: { ...testConfig.limits, chatPerWindow: 2 } };
    const { handler } = setup({ config, now: () => 1_000_000 });
    for (let index = 0; index < 2; index += 1) {
      const ok = await handler(makeRequest());
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const res = await handler(makeRequest());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("keys the rate limit by client address", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key, windowMs, now) {
        keys.push(key);
        return Promise.resolve({ count: 1, resetAt: now + windowMs });
      },
    };
    const { handler } = setup({ store });
    const res = await handler(makeRequest());
    await res.text();
    expect(keys).toEqual(["chat:203.0.113.9"]);
  });

  it("checks the origin before touching the rate limit", async () => {
    // Origin is checked before the rate limit, so a foreign origin never hits the store.
    const hit = vi.fn(() => Promise.resolve({ count: 1, resetAt: 1 }));
    const { handler } = setup({ store: { hit } });
    await handler(makeRequest({ headers: { origin: "https://evil.example" } }));
    expect(hit).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid messages without echoing them", async () => {
    const { handler, createClient } = setup();
    const res = await handler(
      makeRequest({ body: body([{ role: "assistant", content: SECRET_TEXT }]) }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(SECRET_TEXT);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("holding mode", () => {
  it("answers with the holding reply when there is no key", async () => {
    const { handler, createClient } = setup({ env: {} });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-chat-mode")).toBe("holding");
    expect(await res.text()).toBe(holdingReply(testContent));
    expect(createClient).not.toHaveBeenCalled();
  });

  it("treats a blank key as missing", async () => {
    const { handler, createClient } = setup({ env: { ANTHROPIC_API_KEY: "   " } });
    const res = await handler(makeRequest());
    expect(res.headers.get("x-chat-mode")).toBe("holding");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("answers with the holding reply when the daily budget is spent", async () => {
    const { handler, createClient } = setup({ budget: new DailyBudget(1) });
    const first = await handler(makeRequest());
    expect(first.headers.get("x-chat-mode")).toBe("live");
    await first.text();

    const second = await handler(makeRequest());
    expect(second.status).toBe(200);
    expect(second.headers.get("x-chat-mode")).toBe("holding");
    expect(await second.text()).toBe(holdingReply(testContent));
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("builds a budget from CHAT_DAILY_LIMIT", async () => {
    const { handler } = setup({
      env: { ANTHROPIC_API_KEY: "k", CHAT_DAILY_LIMIT: "1" },
    });
    await (await handler(makeRequest())).text();
    const second = await handler(makeRequest());
    expect(second.headers.get("x-chat-mode")).toBe("holding");
  });

  it("makes no model call when CHAT_DAILY_LIMIT is 0", async () => {
    const { handler, createClient } = setup({
      env: { ANTHROPIC_API_KEY: "k", CHAT_DAILY_LIMIT: "0" },
    });
    const res = await handler(makeRequest());
    expect(res.headers.get("x-chat-mode")).toBe("holding");
    expect(await res.text()).toBe(holdingReply(testContent));
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not spend budget when there is no key", async () => {
    const budget = new DailyBudget(1);
    const spy = vi.spyOn(budget, "tryConsume");
    const { handler } = setup({ env: {}, budget });
    await (await handler(makeRequest())).text();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("live replies", () => {
  it("streams the filtered chunks with the live headers", async () => {
    const client = fakeClient({ chunks: ["Open 9\u2013", "5 \u2014", " call us. "] });
    const { handler } = setup({}, client);
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-chat-mode")).toBe("live");
    expect(await res.text()).toBe("Open 9-5, call us. ");
  });

  it("passes the model request to the client", async () => {
    const client = fakeClient();
    const { handler } = setup({}, client);
    const controller = new AbortController();
    const request = makeRequest({
      signal: controller.signal,
      body: body([
        { role: "user", content: "  First  " },
        { role: "assistant", content: "Reply" },
        { role: "user", content: "Second" },
      ]),
    });
    await (await handler(request)).text();

    expect(client.requests).toHaveLength(1);
    const sent = client.requests[0];
    expect(sent?.model).toBe(DEFAULT_MODEL);
    expect(sent?.system).toBe(buildSystemPrompt(testContent, testConfig));
    expect(sent?.messages).toEqual([
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply" },
      { role: "user", content: "Second" },
    ]);
    expect(sent?.maxTokens).toBe(testConfig.limits.maxOutputTokens);
    expect(sent?.signal).toBe(request.signal);
  });

  it("passes the key and reuses the same system prompt string", async () => {
    const client = fakeClient();
    const { handler, createClient } = setup({}, client);
    await (await handler(makeRequest())).text();
    await (await handler(makeRequest())).text();
    expect(createClient).toHaveBeenCalledWith("test-key");
    expect(client.requests[1]?.system).toBe(client.requests[0]?.system);
  });

  it("trims the key and honours CHAT_MODEL", async () => {
    const client = fakeClient();
    const { handler, createClient } = setup(
      { env: { ANTHROPIC_API_KEY: "  spaced-key \n", CHAT_MODEL: " claude-haiku-4-5 " } },
      client,
    );
    await (await handler(makeRequest())).text();
    expect(createClient).toHaveBeenCalledWith("spaced-key");
    expect(client.requests[0]?.model).toBe("claude-haiku-4-5");
  });

  it("falls back to the default model for a blank CHAT_MODEL", async () => {
    const client = fakeClient();
    const { handler } = setup({ env: { ANTHROPIC_API_KEY: "k", CHAT_MODEL: "  " } }, client);
    await (await handler(makeRequest())).text();
    expect(client.requests[0]?.model).toBe(DEFAULT_MODEL);
  });
});

describe("fallbacks", () => {
  it("sends the fallback reply for a refusal with no text", async () => {
    const client = fakeClient({ chunks: [], outcome: { stopReason: "refusal" } });
    const { handler } = setup({}, client);
    expect(await (await handler(makeRequest())).text()).toBe(fallbackReply(testContent));
  });

  it("sends the fallback reply for an empty reply", async () => {
    const client = fakeClient({ chunks: [] });
    const { handler } = setup({}, client);
    expect(await (await handler(makeRequest())).text()).toBe(fallbackReply(testContent));
  });

  it("sends the fallback reply when the reply is only dashes and spaces", async () => {
    const client = fakeClient({ chunks: ["\u2014", " "] });
    const { handler } = setup({}, client);
    expect(await (await handler(makeRequest())).text()).toBe(fallbackReply(testContent));
  });

  it("appends the suffix for a refusal after text", async () => {
    const client = fakeClient({ chunks: ["Partial"], outcome: { stopReason: "refusal" } });
    const { handler } = setup({}, client);
    expect(await (await handler(makeRequest())).text()).toBe(
      `Partial${interruptedSuffix(testContent)}`,
    );
  });

  it("sends the fallback reply for an error before any text", async () => {
    const client = fakeClient({ chunks: ["unused"], error: { after: 0, value: new Error("x") } });
    const { handler } = setup({}, client);
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(fallbackReply(testContent));
  });

  it("appends the suffix for an error after text", async () => {
    const client = fakeClient({
      chunks: ["Partial", " more"],
      error: { after: 1, value: new Error("x") },
    });
    const { handler } = setup({}, client);
    expect(await (await handler(makeRequest())).text()).toBe(
      `Partial${interruptedSuffix(testContent)}`,
    );
  });

  it("appends the suffix when only the final outcome fails after text", async () => {
    const client = fakeClient({ chunks: ["Done."], doneError: new Error("late") });
    const { handler } = setup({}, client);
    expect(await (await handler(makeRequest())).text()).toBe(
      `Done.${interruptedSuffix(testContent)}`,
    );
  });

  it("closes without a fallback when the request was aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = fakeClient({ chunks: [], error: { after: 0, value: new Error("aborted") } });
    const { handler, logs } = setup({}, client);
    const res = await handler(makeRequest({ signal: controller.signal }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(logs).toEqual([]);
  });

  it("returns the fallback as a plain 200 when createClient throws", async () => {
    const { handler, logs } = setup({
      createClient: () => {
        throw new Error("no sdk at /secret/path");
      },
    });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(fallbackReply(testContent));
    expect(logs.join("\n")).not.toContain("/secret/path");
  });

  it("returns the fallback as a plain 200 when stream throws synchronously", async () => {
    const client: ChatModelClient = {
      stream() {
        throw new Error("sync failure");
      },
    };
    const { handler } = setup({}, client);
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(fallbackReply(testContent));
  });
});

describe("logging", () => {
  it("logs one reply line with counts and no visitor text", async () => {
    const client = fakeClient();
    const { handler, logs } = setup({}, client);
    const res = await handler(
      makeRequest({ body: body([{ role: "user", content: SECRET_TEXT }]) }),
    );
    await res.text();
    expect(logs).toEqual([
      "chat reply model=claude-opus-5-5 in=120 out=30 cache_read=100 stop=end_turn",
    ]);
    expect(logs.join("\n")).not.toContain(SECRET_TEXT);
    expect(logs.join("\n")).not.toContain("203.0.113.9");
  });

  it("logs an error line with only the error name", async () => {
    class UpstreamError extends Error {
      constructor() {
        super(`failed for ${SECRET_TEXT}`);
        this.name = "UpstreamError";
      }
    }
    const client = fakeClient({ chunks: [], error: { after: 0, value: new UpstreamError() } });
    const { handler, logs } = setup({}, client);
    await (await handler(makeRequest())).text();
    expect(logs).toEqual(["chat error name=UpstreamError"]);
  });

  it("defaults to console.log", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const handler = createChatHandler({
        content: testContent,
        config: testConfig,
        env: { ANTHROPIC_API_KEY: "k" },
        createClient: () => fakeClient(),
      });
      await (await handler(makeRequest())).text();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("cancellation", () => {
  it("stops reading the model when the response is cancelled", async () => {
    let finished = false;
    let produced = 0;
    const client: ChatModelClient = {
      stream() {
        async function* textChunks(): AsyncGenerator<string> {
          try {
            for (;;) {
              produced += 1;
              await Promise.resolve();
              yield "word ";
            }
          } finally {
            finished = true;
          }
        }
        return { textChunks: textChunks(), done: new Promise<ReplyOutcome>(() => undefined) };
      },
    };
    const { handler, logs } = setup({}, client);
    const res = await handler(makeRequest());
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader?.read();
    expect(first?.done).toBe(false);
    await reader?.cancel();

    await vi.waitFor(() => expect(finished).toBe(true));
    const seen = produced;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(produced).toBe(seen);
    expect(logs).toEqual([]);
  });
});
