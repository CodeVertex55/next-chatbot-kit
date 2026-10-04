import { describe, expect, it } from "vitest";
import {
  MAX_ASSISTANT_CHARS,
  MAX_BODY_BYTES,
  checkOrigin,
  clientIp,
  jsonError,
  parseAllowedOrigins,
  readJsonBody,
  validateMessages,
} from "@/chat/guard";
import type { ChatLimits } from "@/chat/config";

const limits: ChatLimits = {
  maxMessageChars: 100,
  maxTurns: 3,
  chatPerWindow: 20,
  leadPerWindow: 5,
  windowMs: 600000,
  maxOutputTokens: 500,
};

function req(url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Request {
  return new Request(url, { method: "POST", headers, ...init });
}

describe("parseAllowedOrigins", () => {
  it("returns an empty list for unset or empty values", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins(" , ,")).toEqual([]);
  });

  it("accepts hosts and full origins and lower-cases them", () => {
    expect(
      parseAllowedOrigins("Example.com, https://Shop.Example.com, http://localhost:3000"),
    ).toEqual(["example.com", "shop.example.com", "localhost:3000"]);
  });

  it("drops entries that cannot be parsed", () => {
    expect(parseAllowedOrigins("good.example, http://")).toEqual(["good.example"]);
  });
});

describe("checkOrigin", () => {
  it("accepts the same host", () => {
    const r = req("https://site.example/api/chat", { origin: "https://site.example" });
    expect(checkOrigin(r, [])).toBe(true);
  });

  it("rejects a different host", () => {
    const r = req("https://site.example/api/chat", { origin: "https://evil.example" });
    expect(checkOrigin(r, [])).toBe(false);
  });

  it("rejects a missing origin", () => {
    expect(checkOrigin(req("https://site.example/api/chat"), ["site.example"])).toBe(false);
  });

  it("rejects a malformed origin", () => {
    const r = req("https://site.example/api/chat", { origin: "not a url" });
    expect(checkOrigin(r, ["not a url"])).toBe(false);
  });

  it("accepts a host in the allowed list", () => {
    const r = req("https://api.example/api/chat", { origin: "https://www.example.com" });
    expect(checkOrigin(r, ["www.example.com"])).toBe(true);
  });

  it("accepts a host given as a full origin in the allowed list", () => {
    const r = req("https://api.example/api/chat", { origin: "https://www.example.com" });
    expect(checkOrigin(r, parseAllowedOrigins("https://www.example.com"))).toBe(true);
  });

  it("ignores case differences", () => {
    const r = req("https://site.example/api/chat", { origin: "https://SITE.Example" });
    expect(checkOrigin(r, [])).toBe(true);
    const other = req("https://api.example/api/chat", { origin: "https://WWW.Example.com" });
    expect(checkOrigin(other, ["www.example.com"])).toBe(true);
  });

  it("treats a port mismatch as a mismatch", () => {
    const r = req("https://site.example/api/chat", { origin: "https://site.example:8443" });
    expect(checkOrigin(r, [])).toBe(false);
  });

  it("matches ports when both carry one", () => {
    const r = req("http://localhost:3000/api/chat", { origin: "http://localhost:3000" });
    expect(checkOrigin(r, [])).toBe(true);
  });

  it("prefers the Host header over the URL host when present", () => {
    const headers = new Headers({ origin: "https://front.example", host: "front.example" });
    const stub = { headers, url: "http://internal:3000/api/chat" } as unknown as Request;
    expect(checkOrigin(stub, [])).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry, trimmed", () => {
    const r = req("https://site.example", { "x-forwarded-for": " 203.0.113.5 , 10.0.0.1" });
    expect(clientIp(r)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    const r = req("https://site.example", { "x-real-ip": "198.51.100.7" });
    expect(clientIp(r)).toBe("198.51.100.7");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const r = req("https://site.example", {
      "x-forwarded-for": "203.0.113.5",
      "x-real-ip": "198.51.100.7",
    });
    expect(clientIp(r)).toBe("203.0.113.5");
  });

  it("returns unknown when no header is present", () => {
    expect(clientIp(req("https://site.example"))).toBe("unknown");
  });

  it("falls back when x-forwarded-for is blank", () => {
    const r = req("https://site.example", { "x-forwarded-for": " ", "x-real-ip": "198.51.100.7" });
    expect(clientIp(r)).toBe("198.51.100.7");
  });

  it("truncates to 64 characters", () => {
    const r = req("https://site.example", { "x-forwarded-for": "a".repeat(200) });
    expect(clientIp(r)).toHaveLength(64);
  });
});

describe("readJsonBody", () => {
  const json = { "content-type": "application/json" };

  it("returns 415 for the wrong content type", async () => {
    const r = req("https://site.example", { "content-type": "text/plain" }, { body: "{}" });
    expect(await readJsonBody(r)).toEqual({ ok: false, status: 415 });
  });

  it("returns 415 when the content type is missing", async () => {
    const r = new Request("https://site.example", { method: "POST" });
    expect(await readJsonBody(r)).toEqual({ ok: false, status: 415 });
  });

  it("accepts a content type with a charset", async () => {
    const r = req(
      "https://site.example",
      { "content-type": "application/json; charset=utf-8" },
      { body: '{"a":1}' },
    );
    expect(await readJsonBody(r)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("returns 413 when content-length exceeds the cap", async () => {
    const headers = new Headers({ ...json, "content-length": "70000" });
    const stub = {
      headers,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)),
    } as unknown as Request;
    expect(await readJsonBody(stub)).toEqual({ ok: false, status: 413 });
  });

  it("returns 413 when the bytes read exceed the cap", async () => {
    const body = JSON.stringify({ text: "x".repeat(MAX_BODY_BYTES) });
    const r = req("https://site.example", json, { body });
    expect(await readJsonBody(r)).toEqual({ ok: false, status: 413 });
  });

  it("honours a custom cap", async () => {
    const r = req("https://site.example", json, { body: JSON.stringify({ text: "x".repeat(50) }) });
    expect(await readJsonBody(r, 20)).toEqual({ ok: false, status: 413 });
  });

  it("returns 413 and cancels a streamed body that has no content length", async () => {
    const encoder = new TextEncoder();
    const total = 40;
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= total) {
          controller.close();
          return;
        }
        pulled += 1;
        controller.enqueue(encoder.encode("x".repeat(1000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const r = new Request("https://site.example", {
      method: "POST",
      headers: json,
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(r.headers.get("content-length")).toBeNull();
    expect(await readJsonBody(r, 5000)).toEqual({ ok: false, status: 413 });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(total);
  });

  it("reads a streamed body that is under the cap", async () => {
    const encoder = new TextEncoder();
    const parts = ['{"a":', '"caf\u00e9 ', "\u00e9", '"}'];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const r = new Request("https://site.example", {
      method: "POST",
      headers: json,
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readJsonBody(r)).toEqual({ ok: true, value: { a: "caf\u00e9 \u00e9" } });
  });

  it("returns 400 when the body is null", async () => {
    const stub = { headers: new Headers(json), body: null } as unknown as Request;
    expect(await readJsonBody(stub)).toEqual({ ok: false, status: 400 });
  });

  it("returns 400 when reading the body fails", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("broken"));
      },
    });
    const stub = { headers: new Headers(json), body: stream } as unknown as Request;
    expect(await readJsonBody(stub)).toEqual({ ok: false, status: 400 });
  });

  it("returns 400 for bad JSON", async () => {
    const r = req("https://site.example", json, { body: "{not json" });
    expect(await readJsonBody(r)).toEqual({ ok: false, status: 400 });
  });

  it("returns 400 for an empty body", async () => {
    const r = req("https://site.example", json, { body: "" });
    expect(await readJsonBody(r)).toEqual({ ok: false, status: 400 });
  });

  it("returns the parsed value for good JSON", async () => {
    const r = req("https://site.example", json, { body: '{"messages":[]}' });
    expect(await readJsonBody(r)).toEqual({ ok: true, value: { messages: [] } });
  });
});

describe("validateMessages", () => {
  const u = (content: string) => ({ role: "user", content });
  const a = (content: string) => ({ role: "assistant", content });

  function fails(value: unknown) {
    const result = validateMessages(value, limits);
    expect(result.ok).toBe(false);
    return result;
  }

  it("accepts a single user message", () => {
    expect(validateMessages({ messages: [u("hello")] }, limits)).toEqual({
      ok: true,
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("accepts an alternating conversation ending with a user turn", () => {
    const result = validateMessages({ messages: [u("hi"), a("hello"), u("hours?")] }, limits);
    expect(result).toEqual({
      ok: true,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "hours?" },
      ],
    });
  });

  it("rejects a value that is not an object", () => {
    fails(null);
    fails("text");
    fails([u("hi")]);
  });

  it("rejects a missing or non-array messages field", () => {
    fails({});
    fails({ messages: "hi" });
  });

  it("rejects an empty messages array", () => {
    fails({ messages: [] });
  });

  it("rejects an item that is not an object", () => {
    fails({ messages: ["hi"] });
    fails({ messages: [null] });
  });

  it("rejects an unknown role", () => {
    fails({ messages: [{ role: "system", content: "hi" }] });
  });

  it("rejects non-string content", () => {
    fails({ messages: [{ role: "user", content: 5 }] });
  });

  it("rejects empty content after trimming", () => {
    fails({ messages: [u("   ")] });
  });

  it("rejects a user message over the limit", () => {
    fails({ messages: [u("x".repeat(101))] });
  });

  it("accepts a user message exactly at the limit and trims it", () => {
    const result = validateMessages({ messages: [u(`  ${"x".repeat(100)}  `)] }, limits);
    expect(result).toEqual({ ok: true, messages: [{ role: "user", content: "x".repeat(100) }] });
  });

  it("allows assistant content longer than the user limit up to the assistant cap", () => {
    const long = "y".repeat(MAX_ASSISTANT_CHARS);
    const result = validateMessages({ messages: [u("hi"), a(long), u("more")] }, limits);
    expect(result.ok).toBe(true);
  });

  it("rejects assistant content over the assistant cap", () => {
    fails({ messages: [u("hi"), a("y".repeat(MAX_ASSISTANT_CHARS + 1)), u("more")] });
  });

  it("rejects roles that do not alternate", () => {
    fails({ messages: [u("one"), u("two")] });
    fails({ messages: [u("one"), a("two"), a("three"), u("four")] });
  });

  it("rejects a conversation that starts with an assistant turn", () => {
    fails({ messages: [a("hello"), u("hi")] });
  });

  it("rejects a conversation whose last message is not from the user", () => {
    fails({ messages: [u("hi"), a("hello")] });
  });

  it("keeps the last maxTurns * 2 items and starts on a user turn", () => {
    const messages = [
      u("m1"),
      a("m2"),
      u("m3"),
      a("m4"),
      u("m5"),
      a("m6"),
      u("m7"),
      a("m8"),
      u("m9"),
    ];
    const result = validateMessages({ messages }, limits);
    expect(result).toEqual({
      ok: true,
      messages: [
        { role: "user", content: "m5" },
        { role: "assistant", content: "m6" },
        { role: "user", content: "m7" },
        { role: "assistant", content: "m8" },
        { role: "user", content: "m9" },
      ],
    });
  });

  it("drops from the front until the first kept turn is a user turn", () => {
    const messages = [u("m1"), a("m2"), u("m3"), a("m4"), u("m5"), a("m6"), u("m7"), a("m8")];
    // 8 items, last 6 are m3..m8 which starts on a user turn, but the last is assistant.
    fails({ messages });
    const withUser = [...messages, u("m9")];
    // 9 items, last 6 are m4..m9 which starts on an assistant turn, so m4 is dropped.
    const result = validateMessages({ messages: withUser }, limits);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages[0]).toEqual({ role: "user", content: "m5" });
      expect(result.messages.at(-1)).toEqual({ role: "user", content: "m9" });
    }
  });

  it("strips extra properties and returns fresh objects", () => {
    const input = { role: "user", content: "hi", id: 7, extra: { a: 1 } };
    const result = validateMessages({ messages: [input], other: true }, limits);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages[0]).toEqual({ role: "user", content: "hi" });
      expect(Object.keys(result.messages[0] ?? {})).toEqual(["role", "content"]);
      expect(result.messages[0]).not.toBe(input);
    }
  });

  it("uses fixed error strings that never echo the input", () => {
    const secret = "do-not-echo-this-text";
    const cases: unknown[] = [
      { messages: [{ role: secret, content: "hi" }] },
      { messages: [u(secret.repeat(20))] },
      { messages: [u(secret), u(secret)] },
    ];
    for (const value of cases) {
      const result = validateMessages(value, limits);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toContain(secret);
    }
  });
});

describe("jsonError", () => {
  it("builds a JSON response with the status and error", async () => {
    const res = jsonError(429, "Too many requests", { "Retry-After": "12" });
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("retry-after")).toBe("12");
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  it("works without extra headers", async () => {
    const res = jsonError(400, "Bad request");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad request" });
  });
});
