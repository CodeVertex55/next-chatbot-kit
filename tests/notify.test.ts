import { describe, expect, it, vi } from "vitest";
import {
  createConsoleNotifier,
  createResendNotifier,
  createWebhookNotifier,
  notifiersFromEnv,
} from "@/chat/notify";
import { renderCallbackEmail } from "@/chat/email/template";
import type { FetchLike, Lead } from "@/chat/notify/types";
import { testConfig, testContent } from "./fixtures";

const lead: Lead = {
  name: "Maya Ortega",
  phone: "555 0142",
  email: "maya@example.com",
  page: "/menu",
  receivedAt: "2026-10-04T09:30:00.000Z",
};

interface Call {
  input: string;
  init: RequestInit;
}

function fakeFetch(status = 200, responseBody = "{}") {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    calls.push({ input, init });
    return Promise.resolve(new Response(responseBody, { status }));
  };
  return { calls, fetchImpl };
}

function bodyOf(call: Call | undefined): Record<string, unknown> {
  expect(typeof call?.init.body).toBe("string");
  return JSON.parse(call?.init.body as string) as Record<string, unknown>;
}

describe("createResendNotifier", () => {
  const base = {
    apiKey: "re_test_key",
    to: "owner@testloaf.example",
    from: "Chat <chat@testloaf.example>",
    businessName: "Test Loaf Bakery",
    siteUrl: "https://testloaf.example",
    accent: "#0f766e",
  };

  it("is named resend", () => {
    expect(createResendNotifier(base).name).toBe("resend");
  });

  it("posts the email to the Resend API", async () => {
    const { calls, fetchImpl } = fakeFetch();
    await createResendNotifier({ ...base, fetchImpl }).notify(lead);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.input).toBe("https://api.resend.com/emails");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });

    const email = renderCallbackEmail(lead, base);
    expect(bodyOf(call)).toEqual({
      from: base.from,
      to: [base.to],
      reply_to: lead.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  });

  it("throws the status without any response text on a non-2xx reply", async () => {
    const { fetchImpl } = fakeFetch(422, '{"message":"secret detail maya@example.com"}');
    const notifier = createResendNotifier({ ...base, fetchImpl });
    const error = await notifier.notify(lead).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("resend responded 422");
  });

  it("passes a timeout signal", async () => {
    const { calls, fetchImpl } = fakeFetch();
    await createResendNotifier({ ...base, fetchImpl }).notify(lead);
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("createWebhookNotifier", () => {
  const url = "https://hooks.example.org/leads";

  it("is named webhook", () => {
    expect(createWebhookNotifier({ url }).name).toBe("webhook");
  });

  it("posts the lead as json", async () => {
    const { calls, fetchImpl } = fakeFetch();
    await createWebhookNotifier({ url, fetchImpl }).notify(lead);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.input).toBe(url);
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers).toEqual({ "Content-Type": "application/json" });
    expect(bodyOf(call)).toEqual({
      type: "chat.lead",
      name: "Maya Ortega",
      phone: "555 0142",
      email: "maya@example.com",
      page: "/menu",
      receivedAt: "2026-10-04T09:30:00.000Z",
    });
  });

  it("uses a ten second timeout signal", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    try {
      const { calls, fetchImpl } = fakeFetch();
      await createWebhookNotifier({ url, fetchImpl }).notify(lead);
      expect(spy).toHaveBeenCalledWith(10000);
      expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    } finally {
      spy.mockRestore();
    }
  });

  it("throws the status without any response text on a non-2xx reply", async () => {
    const { fetchImpl } = fakeFetch(500, "internal detail 555 0142");
    const error = await createWebhookNotifier({ url, fetchImpl })
      .notify(lead)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((error as Error).message).toBe("webhook responded 500");
  });

  it("lets a network failure reject", async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error("offline"));
    await expect(createWebhookNotifier({ url, fetchImpl }).notify(lead)).rejects.toThrow();
  });
});

describe("createConsoleNotifier", () => {
  it("logs one fixed line and nothing about the lead", async () => {
    const lines: string[] = [];
    const notifier = createConsoleNotifier((line) => lines.push(line));
    expect(notifier.name).toBe("console");
    await notifier.notify(lead);
    expect(lines).toEqual(["lead received (no notifier configured)"]);
  });
});

describe("notifiersFromEnv", () => {
  function build(env: Record<string, string | undefined>, fetchImpl?: FetchLike) {
    const lines: string[] = [];
    const options: Parameters<typeof notifiersFromEnv>[1] = {
      content: testContent,
      config: testConfig,
      log: (line) => lines.push(line),
    };
    if (fetchImpl !== undefined) options.fetchImpl = fetchImpl;
    const notifiers = notifiersFromEnv(env, options);
    return { names: notifiers.map((n) => n.name), notifiers, lines };
  }

  const resendEnv = {
    RESEND_API_KEY: "re_test_key",
    LEAD_EMAIL_TO: "owner@testloaf.example",
    LEAD_EMAIL_FROM: "chat@testloaf.example",
  };

  it("falls back to console when nothing is set", () => {
    expect(build({}).names).toEqual(["console"]);
  });

  it("builds resend when all three values are set", () => {
    expect(build(resendEnv).names).toEqual(["resend"]);
  });

  it("skips resend when any value is missing or blank", () => {
    for (const key of Object.keys(resendEnv)) {
      expect(build({ ...resendEnv, [key]: undefined }).names).toEqual(["console"]);
      expect(build({ ...resendEnv, [key]: "" }).names).toEqual(["console"]);
      expect(build({ ...resendEnv, [key]: "   " }).names).toEqual(["console"]);
    }
  });

  it("builds a webhook for an https url", () => {
    expect(build({ LEAD_WEBHOOK_URL: "https://hooks.example.org/x" }).names).toEqual(["webhook"]);
  });

  it("allows http only for localhost and 127.0.0.1", () => {
    expect(build({ LEAD_WEBHOOK_URL: "http://localhost:3000/hook" }).names).toEqual(["webhook"]);
    expect(build({ LEAD_WEBHOOK_URL: "http://127.0.0.1:8080/hook" }).names).toEqual(["webhook"]);
  });

  it("rejects an http url that is not local and logs why", () => {
    const { names, lines } = build({ LEAD_WEBHOOK_URL: "http://example.com/hook" });
    expect(names).toEqual(["console"]);
    expect(lines).toEqual(["lead webhook url ignored (must be https)"]);
  });

  it("rejects text that is not a url and other schemes", () => {
    for (const value of ["not a url", "ftp://example.com/x", "javascript:alert(1)"]) {
      const { names, lines } = build({ LEAD_WEBHOOK_URL: value });
      expect(names).toEqual(["console"]);
      expect(lines).toEqual(["lead webhook url ignored (must be https)"]);
    }
  });

  it("does not log anything for an unset or blank webhook url", () => {
    expect(build({ LEAD_WEBHOOK_URL: "" }).lines).toEqual([]);
    expect(build({ LEAD_WEBHOOK_URL: undefined }).lines).toEqual([]);
  });

  it("never logs the webhook url", () => {
    const { lines } = build({ LEAD_WEBHOOK_URL: "http://example.com/secret-path" });
    expect(lines.join(" ")).not.toContain("secret-path");
  });

  it("builds both when both are configured", () => {
    const env = { ...resendEnv, LEAD_WEBHOOK_URL: "https://hooks.example.org/x" };
    expect(build(env).names).toEqual(["resend", "webhook"]);
  });

  it("wires the business, accent and fetch into the resend notifier", async () => {
    const { calls, fetchImpl } = fakeFetch();
    const { notifiers } = build(resendEnv, fetchImpl);
    await notifiers[0]?.notify(lead);
    const body = bodyOf(calls[0]);
    expect(body.from).toBe("chat@testloaf.example");
    expect(body.to).toEqual(["owner@testloaf.example"]);
    expect(String(body.html)).toContain("Sent from the chat on Test Loaf Bakery");
    expect(String(body.html)).toContain(testConfig.accent);
    expect(String(body.html)).toContain("https://testloaf.example/menu");
  });

  it("wires fetch into the webhook notifier", async () => {
    const { calls, fetchImpl } = fakeFetch();
    const { notifiers } = build({ LEAD_WEBHOOK_URL: "https://hooks.example.org/x" }, fetchImpl);
    await notifiers[0]?.notify(lead);
    expect(calls[0]?.input).toBe("https://hooks.example.org/x");
  });

  it("logs through the supplied logger for the console notifier", async () => {
    const { notifiers, lines } = build({});
    await notifiers[0]?.notify(lead);
    expect(lines).toEqual(["lead received (no notifier configured)"]);
  });
});
