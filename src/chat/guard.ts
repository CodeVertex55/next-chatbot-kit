import type { ChatLimits } from "./config";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const MAX_BODY_BYTES = 65536;
export const MAX_ASSISTANT_CHARS = 4000;

const MAX_IP_CHARS = 64;

function hostOfEntry(entry: string): string | null {
  const text = entry.trim();
  if (text === "") return null;
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    return url.host === "" ? null : url.host.toLowerCase();
  } catch {
    return null;
  }
}

/** Turns a comma-separated list of hosts or full origins into lower-cased hosts. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined) return [];
  const hosts: string[] = [];
  for (const entry of value.split(",")) {
    const host = hostOfEntry(entry);
    if (host !== null) hosts.push(host);
  }
  return hosts;
}

function requestHost(request: Request): string | null {
  const header = request.headers.get("host");
  if (header !== null && header.trim() !== "") return header.trim().toLowerCase();
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the Origin header matches the request host or an allowed host. */
export function checkOrigin(request: Request, allowedHosts: string[]): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  if (originHost === "") return false;
  if (originHost === requestHost(request)) return true;
  return allowedHosts.includes(originHost);
}

/** Best-effort client address for rate limiting. Never stored or logged. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, MAX_IP_CHARS);
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, MAX_IP_CHARS);
  return "unknown";
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415 };

/** Reads a JSON request body with a size cap. */
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<BodyResult> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return { ok: false, status: 415 };

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };

  const stream = request.body;
  if (stream === null || stream === undefined) return { ok: false, status: 400 };

  // The cap is enforced while reading, so an oversized body is never buffered whole.
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

export type MessagesResult = { ok: true; messages: ChatMessage[] } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserItem(value: unknown): boolean {
  return isRecord(value) && value.role === "user";
}

const BAD_SHAPE = "Invalid request";
const BAD_CONTENT = "Invalid message";
const TOO_LONG = "Message too long";
const BAD_ORDER = "Invalid conversation";

/** Checks the chat history and returns clean copies. Error text never echoes input. */
export function validateMessages(value: unknown, limits: ChatLimits): MessagesResult {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    return { ok: false, error: BAD_SHAPE };
  }
  let items: unknown[] = value.messages;
  if (items.length === 0) return { ok: false, error: BAD_SHAPE };

  const keep = limits.maxTurns * 2;
  if (items.length > keep) {
    items = items.slice(-keep);
    while (items.length > 0 && !isUserItem(items[0])) items = items.slice(1);
    if (items.length === 0) return { ok: false, error: BAD_ORDER };
  }

  const messages: ChatMessage[] = [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) return { ok: false, error: BAD_CONTENT };
    const { role, content } = item;
    if (role !== "user" && role !== "assistant") return { ok: false, error: BAD_CONTENT };
    if (typeof content !== "string") return { ok: false, error: BAD_CONTENT };
    const text = content.trim();
    if (text === "") return { ok: false, error: BAD_CONTENT };
    const cap = role === "user" ? limits.maxMessageChars : MAX_ASSISTANT_CHARS;
    if (text.length > cap) return { ok: false, error: TOO_LONG };
    const expected = index % 2 === 0 ? "user" : "assistant";
    if (role !== expected) return { ok: false, error: BAD_ORDER };
    messages.push({ role, content: text });
  }

  if (messages[messages.length - 1]?.role !== "user") return { ok: false, error: BAD_ORDER };
  return { ok: true, messages };
}

export function jsonError(
  status: number,
  error: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
