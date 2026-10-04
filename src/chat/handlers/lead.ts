import type { ChatConfig } from "../config";
import type { BusinessContent } from "../content";
import { errorStatus } from "../errors";
import { checkOrigin, clientIp, jsonError, parseAllowedOrigins, readJsonBody } from "../guard";
import { validateLead } from "../lead";
import { notifiersFromEnv } from "../notify";
import type { Lead, LeadNotifier } from "../notify/types";
import { MemoryRateLimitStore, checkRateLimit, type RateLimitStore } from "../rate-limit";

export interface LeadHandlerDeps {
  content: BusinessContent;
  config: ChatConfig;
  env?: Record<string, string | undefined>;
  notifiers?: LeadNotifier[];
  store?: RateLimitStore;
  now?: () => number;
  log?: (line: string) => void;
}

const BODY_ERRORS = {
  400: "Invalid request",
  413: "Request too large",
  415: "Unsupported content type",
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function createLeadHandler(deps: LeadHandlerDeps): (request: Request) => Promise<Response> {
  const { content, config } = deps;
  const env = deps.env ?? process.env;
  const store = deps.store ?? new MemoryRateLimitStore();
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const notifiers = deps.notifiers ?? notifiersFromEnv(env, { content, config, log });
  const { limits } = config;

  return async function handleLead(request: Request): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return jsonError(parsed.status, BODY_ERRORS[parsed.status]);

    if (!checkOrigin(request, parseAllowedOrigins(env.CHAT_ALLOWED_ORIGINS))) {
      return jsonError(403, "Forbidden");
    }

    const limit = await checkRateLimit(
      store,
      `lead:${clientIp(request)}`,
      limits.leadPerWindow,
      limits.windowMs,
      now(),
    );
    if (!limit.allowed) {
      return jsonError(429, "Too many requests", {
        "Retry-After": String(limit.retryAfterSeconds),
      });
    }

    const checked = validateLead(parsed.value);
    if (!checked.ok) return jsonResponse({ ok: false, errors: checked.errors }, 400);
    if (checked.honeypot) return jsonResponse({ ok: true }, 200);

    const lead: Lead = Object.freeze({
      ...checked.lead,
      receivedAt: new Date(now()).toISOString(),
    });
    // Starting each call inside a promise turns a synchronous throw into a rejection.
    const results = await Promise.allSettled(
      notifiers.map((notifier) => Promise.resolve().then(() => notifier.notify(lead))),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const status = errorStatus(result.reason);
        log(`lead notifier failed name=${notifiers[index]?.name ?? "unknown"} status=${status}`);
      }
    });

    return jsonResponse({ ok: true }, 200);
  };
}
