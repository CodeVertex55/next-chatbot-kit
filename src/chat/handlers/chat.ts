import {
  classifyModelError,
  createAnthropicClient,
  type ChatModelClient,
  type ModelErrorInfo,
  type ReplyStream,
} from "../anthropic";
import { DailyBudget, parseDailyLimit } from "../budget";
import type { ChatConfig } from "../config";
import type { BusinessContent } from "../content";
import {
  checkOrigin,
  clientIp,
  jsonError,
  parseAllowedOrigins,
  readJsonBody,
  validateMessages,
} from "../guard";
import { buildSystemPrompt } from "../knowledge";
import { DEFAULT_MODEL } from "../model";
import { MemoryRateLimitStore, checkRateLimit, type RateLimitStore } from "../rate-limit";
import { fallbackReply, holdingReply, interruptedSuffix } from "../replies";
import { createPunctuationFilter } from "../stream";

export interface ChatHandlerDeps {
  content: BusinessContent;
  config: ChatConfig;
  env?: Record<string, string | undefined>;
  createClient?: (apiKey: string) => ChatModelClient;
  /** Names a failed model call for the log. Defaults to the SDK classifier. */
  classifyError?: (error: unknown) => ModelErrorInfo;
  store?: RateLimitStore;
  budget?: DailyBudget;
  now?: () => number;
  log?: (line: string) => void;
}

const BODY_ERRORS = {
  400: "Invalid request",
  413: "Request too large",
  415: "Unsupported content type",
} as const;

function textResponse(body: BodyInit, mode: "holding" | "live"): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-chat-mode": mode,
    },
  });
}

export function createChatHandler(deps: ChatHandlerDeps): (request: Request) => Promise<Response> {
  const { content, config } = deps;
  const env = deps.env ?? process.env;
  const createClient = deps.createClient ?? createAnthropicClient;
  const classifyError = deps.classifyError ?? classifyModelError;
  const store = deps.store ?? new MemoryRateLimitStore();
  const budget = deps.budget ?? new DailyBudget(parseDailyLimit(env.CHAT_DAILY_LIMIT));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const { limits } = config;
  const system = buildSystemPrompt(content, config);
  const encoder = new TextEncoder();

  function errorLine(error: unknown): string {
    const { kind, status } = classifyError(error);
    return `chat error kind=${kind} status=${status ?? "none"}`;
  }

  function liveResponse(reply: ReplyStream, signal: AbortSignal): Response {
    // The handler reads the outcome itself. This stops an early failure from
    // being reported as an unhandled rejection while the text is still streaming.
    reply.done.catch(() => undefined);

    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const filter = createPunctuationFilter();
        let sent = false;

        const send = (text: string): void => {
          if (cancelled || text === "") return;
          controller.enqueue(encoder.encode(text));
          if (text.trim() !== "") sent = true;
        };
        const sendNotice = (): void => {
          send(sent ? interruptedSuffix(content) : fallbackReply(content));
        };

        try {
          for await (const chunk of reply.textChunks) {
            if (cancelled) break;
            send(filter.push(chunk));
          }
          if (!cancelled) {
            if (sent) send(filter.flush());
            const outcome = await reply.done;
            if (!sent || outcome.stopReason === "refusal") sendNotice();
            log(
              `chat reply model=${outcome.model} in=${outcome.usage.input} out=${outcome.usage.output} cache_read=${outcome.usage.cacheRead} stop=${outcome.stopReason ?? "none"}`,
            );
          }
        } catch (error) {
          if (!cancelled && !signal.aborted) {
            log(errorLine(error));
            sendNotice();
          }
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return textResponse(body, "live");
  }

  return async function handleChat(request: Request): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return jsonError(parsed.status, BODY_ERRORS[parsed.status]);

    if (!checkOrigin(request, parseAllowedOrigins(env.CHAT_ALLOWED_ORIGINS))) {
      return jsonError(403, "Forbidden");
    }

    const limit = await checkRateLimit(
      store,
      `chat:${clientIp(request)}`,
      limits.chatPerWindow,
      limits.windowMs,
      now(),
    );
    if (!limit.allowed) {
      return jsonError(429, "Too many requests", {
        "Retry-After": String(limit.retryAfterSeconds),
      });
    }

    const checked = validateMessages(parsed.value, limits);
    if (!checked.ok) return jsonError(400, checked.error);

    const apiKey = env.ANTHROPIC_API_KEY?.trim() ?? "";
    if (apiKey === "" || !budget.tryConsume(now())) {
      return textResponse(holdingReply(content), "holding");
    }

    let reply: ReplyStream;
    try {
      reply = createClient(apiKey).stream({
        model: env.CHAT_MODEL?.trim() || DEFAULT_MODEL,
        system,
        messages: checked.messages,
        maxTokens: limits.maxOutputTokens,
        signal: request.signal,
      });
    } catch (error) {
      log(errorLine(error));
      return textResponse(fallbackReply(content), "holding");
    }
    return liveResponse(reply, request.signal);
  };
}
