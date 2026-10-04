import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "./guard";
import { FALLBACK_BETA, modelOptions } from "./model";

export interface ReplyRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ReplyOutcome {
  stopReason: string | null;
  model: string;
  usage: { input: number; output: number; cacheRead: number };
}

export interface ReplyStream {
  textChunks: AsyncIterable<string>;
  done: Promise<ReplyOutcome>;
}

/** The only seam between the chat handler and the model provider. */
export interface ChatModelClient {
  stream(request: ReplyRequest): ReplyStream;
}

/** Builds the request body. Only the keys this kit needs are ever set. */
export function buildMessageParams(request: ReplyRequest): Record<string, unknown> {
  const { useEffort, useFallbacks } = modelOptions(request.model);
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: request.messages,
    ...(useEffort ? { output_config: { effort: "low" } } : {}),
    ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {}),
  };
}

type SdkStream = ReturnType<Anthropic["messages"]["stream"]>;
type BetaSdkStream = ReturnType<Anthropic["beta"]["messages"]["stream"]>;

async function* textOf(stream: SdkStream | BetaSdkStream): AsyncGenerator<string> {
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

/** The parts of a final message that both endpoints share. */
interface FinalMessage {
  stop_reason: string | null;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
  };
}

function toReplyStream(stream: SdkStream | BetaSdkStream): ReplyStream {
  const final: Promise<FinalMessage> = stream.finalMessage();
  const done: Promise<ReplyOutcome> = final.then((message) => ({
    stopReason: message.stop_reason,
    model: message.model,
    usage: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
    },
  }));
  // The handler reads this result itself. This keeps a rejection it has already
  // dealt with from also being reported as an unhandled rejection.
  done.catch(() => undefined);
  return { textChunks: textOf(stream), done };
}

export interface ModelErrorInfo {
  kind: "timeout" | "connection" | "aborted" | "api" | "other";
  /** The HTTP status of an API error, otherwise null. */
  status: number | null;
}

/**
 * Names a failure from the SDK by class, not by name: bundlers rename classes, so
 * a name in a production build can be a single letter. The message is never read,
 * because it can quote request text. The timeout class extends the connection
 * class, so it has to be checked first.
 */
export function classifyModelError(error: unknown): ModelErrorInfo {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { kind: "timeout", status: null };
  }
  if (error instanceof Anthropic.APIConnectionError) return { kind: "connection", status: null };
  if (error instanceof Anthropic.APIUserAbortError) return { kind: "aborted", status: null };
  if (error instanceof Anthropic.APIError) {
    const { status } = error;
    return { kind: "api", status: typeof status === "number" ? status : null };
  }
  return { kind: "other", status: null };
}

/** A request that has not finished after this long is abandoned. */
const REQUEST_TIMEOUT_MS = 60_000;
/** One retry covers a brief network fault without doubling the wait on a real outage. */
const MAX_RETRIES = 1;

export function createAnthropicClient(apiKey: string): ChatModelClient {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return {
    // The event iterator must be consumed in the same tick that stream() returns
    // it: the handler starts reading it straight away, so keep it that way.
    stream(request: ReplyRequest): ReplyStream {
      const params = buildMessageParams(request);
      const options = { signal: request.signal };
      if (modelOptions(request.model).useFallbacks) {
        // The fallbacks field is a beta parameter, so the plain object is cast once here.
        const betaParams = params as unknown as Parameters<
          Anthropic["beta"]["messages"]["stream"]
        >[0];
        return toReplyStream(client.beta.messages.stream(betaParams, options));
      }
      const standardParams = params as unknown as Parameters<Anthropic["messages"]["stream"]>[0];
      return toReplyStream(client.messages.stream(standardParams, options));
    },
  };
}
