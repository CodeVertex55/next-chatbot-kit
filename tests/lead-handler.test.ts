import { describe, expect, it, vi } from "vitest";
import { createLeadHandler, type LeadHandlerDeps } from "@/chat/handlers/lead";
import type { Lead, LeadNotifier } from "@/chat/notify/types";
import type { RateLimitStore } from "@/chat/rate-limit";
import { testConfig, testContent } from "./fixtures";

const ORIGIN = "https://testloaf.example";
const URL = `${ORIGIN}/api/chat/lead`;
const NOW = Date.UTC(2026, 9, 4, 9, 30, 0);

const validBody = {
  name: "Maya Ortega",
  phone: "555 0142",
  email: "maya@example.com",
  page: "/menu",
  company: "",
};

function makeRequest(init: { body?: unknown; headers?: Record<string, string> } = {}): Request {
  const raw = init.body === undefined ? validBody : init.body;
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": "203.0.113.9",
      ...init.headers,
    },
    body: typeof raw === "string" ? raw : JSON.stringify(raw),
  });
}

function fakeNotifier(name: string, fail = false) {
  const received: Lead[] = [];
  const notifier: LeadNotifier = {
    name,
    notify(lead) {
      received.push(lead);
      return fail
        ? Promise.reject(new Error(`boom ${lead.phone} ${lead.email}`))
        : Promise.resolve();
    },
  };
  return { notifier, received };
}

function setup(overrides: Partial<LeadHandlerDeps> = {}) {
  const logs: string[] = [];
  const first = fakeNotifier("first");
  const second = fakeNotifier("second");
  const handler = createLeadHandler({
    content: testContent,
    config: testConfig,
    env: {},
    notifiers: [first.notifier, second.notifier],
    now: () => NOW,
    log: (line) => logs.push(line),
    ...overrides,
  });
  return { handler, logs, first, second };
}

describe("request checks", () => {
  it("returns 415 for a wrong content type", async () => {
    const { handler } = setup();
    const res = await handler(makeRequest({ headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
  });

  it("returns 413 for an oversized body", async () => {
    const { handler } = setup();
    const res = await handler(makeRequest({ body: { ...validBody, page: "x".repeat(70000) } }));
    expect(res.status).toBe(413);
  });

  it("returns 400 for malformed JSON", async () => {
    const { handler } = setup();
    const res = await handler(makeRequest({ body: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a foreign or missing origin and never notifies", async () => {
    const { handler, first } = setup();
    const foreign = await handler(makeRequest({ headers: { origin: "https://evil.example" } }));
    expect(foreign.status).toBe(403);

    const missing = new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect((await handler(missing)).status).toBe(403);
    expect(first.received).toHaveLength(0);
  });

  it("accepts an origin listed in CHAT_ALLOWED_ORIGINS", async () => {
    const { handler, first } = setup({ env: { CHAT_ALLOWED_ORIGINS: "https://app.example" } });
    const res = await handler(makeRequest({ headers: { origin: "https://app.example" } }));
    expect(res.status).toBe(200);
    expect(first.received).toHaveLength(1);
  });

  it("returns 429 with Retry-After after leadPerWindow requests", async () => {
    const { handler, first } = setup();
    const limit = testConfig.limits.leadPerWindow;
    for (let i = 0; i < limit; i += 1) {
      expect((await handler(makeRequest())).status).toBe(200);
    }
    const res = await handler(makeRequest());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(first.received).toHaveLength(limit);
  });

  it("keys the rate limit by lead and client address", async () => {
    const keys: string[] = [];
    const store: RateLimitStore = {
      hit(key, windowMs, now) {
        keys.push(key);
        return Promise.resolve({ count: 1, resetAt: now + windowMs });
      },
    };
    const { handler } = setup({ store });
    await handler(makeRequest());
    expect(keys).toEqual(["lead:203.0.113.9"]);
  });

  it("counts invalid and honeypot requests toward the limit", async () => {
    const { handler } = setup();
    const limit = testConfig.limits.leadPerWindow;
    for (let i = 0; i < limit; i += 1) {
      await handler(makeRequest({ body: { ...validBody, name: "" } }));
    }
    expect((await handler(makeRequest())).status).toBe(429);
  });
});

describe("validation", () => {
  it("returns 400 with field errors", async () => {
    const { handler, first } = setup();
    const res = await handler(
      makeRequest({ body: { name: "", phone: "1", email: "nope", page: "/" + "a".repeat(400) } }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      errors: {
        name: "Enter your name.",
        phone: "Enter a valid phone number.",
        email: "Enter a valid email address.",
        page: "Page is too long.",
      },
    });
    expect(first.received).toHaveLength(0);
  });

  it("does not echo the submitted values in the error body", async () => {
    const { handler } = setup();
    const res = await handler(makeRequest({ body: { ...validBody, phone: "secret-9999" } }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("secret-9999");
  });

  it("returns 400 for a body that is not an object", async () => {
    const { handler } = setup();
    expect((await handler(makeRequest({ body: "[]" }))).status).toBe(400);
    expect((await handler(makeRequest({ body: "null" }))).status).toBe(400);
  });
});

describe("honeypot", () => {
  it("answers ok without notifying", async () => {
    const { handler, first, second, logs } = setup();
    const res = await handler(makeRequest({ body: { ...validBody, company: "Acme" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(first.received).toHaveLength(0);
    expect(second.received).toHaveLength(0);
    expect(logs).toEqual([]);
  });

  it("answers ok for a honeypot hit even when the other fields are invalid", async () => {
    const { handler, first } = setup();
    const res = await handler(makeRequest({ body: { name: "", company: "Acme" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(first.received).toHaveLength(0);
  });
});

describe("success", () => {
  it("notifies every notifier with the same lead", async () => {
    const { handler, first, second } = setup();
    const res = await handler(makeRequest({ body: { ...validBody, name: "  Maya Ortega " } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });

    const expected: Lead = {
      name: "Maya Ortega",
      phone: "555 0142",
      email: "maya@example.com",
      page: "/menu",
      receivedAt: "2026-10-04T09:30:00.000Z",
    };
    expect(first.received).toEqual([expected]);
    expect(second.received).toEqual([expected]);
    expect(first.received[0]).toBe(second.received[0]);
  });

  it("leaves the page out of the lead when none is given", async () => {
    const { handler, first } = setup();
    const { page: omitted, ...withoutPage } = validBody;
    void omitted;
    await handler(makeRequest({ body: withoutPage }));
    expect(first.received[0] && "page" in first.received[0]).toBe(false);
  });

  it("stamps receivedAt from the injected clock", async () => {
    const { handler, first } = setup({ now: () => Date.UTC(2030, 0, 2, 3, 4, 5) });
    await handler(makeRequest());
    expect(first.received[0]?.receivedAt).toBe("2030-01-02T03:04:05.000Z");
  });

  it("still answers ok when a notifier rejects, and logs only its name", async () => {
    const bad = fakeNotifier("webhook", true);
    const good = fakeNotifier("resend");
    const { handler, logs } = setup({ notifiers: [bad.notifier, good.notifier] });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(good.received).toHaveLength(1);
    expect(logs).toEqual(["lead notifier failed name=webhook status=none"]);
  });

  it("still answers ok when a notifier throws before returning a promise", async () => {
    const throwing: LeadNotifier = {
      name: "sync",
      notify() {
        throw new Error("sync failure");
      },
    };
    const { handler, logs } = setup({ notifiers: [throwing] });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(logs).toEqual(["lead notifier failed name=sync status=none"]);
  });

  it("logs the numeric status that a failed notifier carries", async () => {
    class DeliveryError extends Error {
      status = 422;
    }
    const failing: LeadNotifier = {
      name: "resend",
      notify: () => Promise.reject(new DeliveryError("maya@example.com rejected")),
    };
    const { handler, logs } = setup({ notifiers: [failing] });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(logs).toEqual(["lead notifier failed name=resend status=422"]);
  });

  it("logs the status of the error a real notifier throws", async () => {
    const fetchImpl = () => Promise.resolve(new Response("{}", { status: 500 }));
    const { createResendNotifier } = await import("@/chat/notify");
    const notifier = createResendNotifier({
      apiKey: "k",
      to: "owner@testloaf.example",
      from: "chat@testloaf.example",
      businessName: "Test Loaf Bakery",
      siteUrl: "https://testloaf.example",
      accent: "#0f766e",
      fetchImpl,
    });
    const { handler, logs } = setup({ notifiers: [notifier] });
    await handler(makeRequest());
    expect(logs).toEqual(["lead notifier failed name=resend status=500"]);
  });

  it("never writes the lead or the address to the log", async () => {
    const bad = fakeNotifier("webhook", true);
    const { handler, logs } = setup({ notifiers: [bad.notifier] });
    await handler(makeRequest());
    await handler(makeRequest({ body: { ...validBody, name: "" } }));
    const text = logs.join("\n");
    expect(text).not.toContain("555 0142");
    expect(text).not.toContain("maya@example.com");
    expect(text).not.toContain("Maya");
    expect(text).not.toContain("203.0.113.9");
  });
});

describe("default notifiers", () => {
  it("uses the console notifier when the environment configures nothing", async () => {
    const logs: string[] = [];
    const handler = createLeadHandler({
      content: testContent,
      config: testConfig,
      env: {},
      log: (line) => logs.push(line),
    });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(logs).toEqual(["lead received (no notifier configured)"]);
  });

  it("builds notifiers from the injected environment", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("the test must not reach the network");
    });
    try {
      const logs: string[] = [];
      const handler = createLeadHandler({
        content: testContent,
        config: testConfig,
        env: { LEAD_WEBHOOK_URL: "http://example.com/hook" },
        log: (line) => logs.push(line),
      });
      const res = await handler(makeRequest());
      expect(res.status).toBe(200);
      expect(logs).toEqual([
        "lead webhook url ignored (must be https)",
        "lead received (no notifier configured)",
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("server entry", () => {
  it("exports the documented values", async () => {
    const entry = await import("@/chat");
    for (const name of [
      "defineChatConfig",
      "toPublicConfig",
      "buildSystemPrompt",
      "createChatHandler",
      "createLeadHandler",
      "MemoryRateLimitStore",
      "DailyBudget",
      "createResendNotifier",
      "createWebhookNotifier",
      "createConsoleNotifier",
      "notifiersFromEnv",
      "createAnthropicClient",
      "DEFAULT_MODEL",
    ]) {
      expect(entry, name).toHaveProperty(name);
    }
  });
});
