import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, DEFAULT_STRINGS, defineChatConfig, toPublicConfig } from "@/chat/config";
import type { ChatConfigInput, ChatLimits } from "@/chat/config";
import { testConfig, testContent } from "./fixtures";

const base: ChatConfigInput = {
  persona: { name: "Sam" },
  greeting: "Hi",
  topics: ["bread"],
};

describe("defineChatConfig defaults", () => {
  it("applies defaults for omitted fields", () => {
    const config = defineChatConfig(base);
    expect(config.persona).toEqual({ name: "Sam", label: "AI assistant" });
    expect(config.greetingDelayMs).toBe(5000);
    expect(config.leadMode).toBe("required");
    expect(config.accent).toBe("#0f766e");
    expect(config.suggestions).toEqual([]);
    expect(config.extraRules).toEqual([]);
    expect(config.limits).toEqual(DEFAULT_LIMITS);
    expect(config.strings).toEqual(DEFAULT_STRINGS);
    expect(config.privacyUrl).toBeUndefined();
    expect(config.demoNotice).toBeUndefined();
  });

  it("has the documented default limits", () => {
    expect(DEFAULT_LIMITS).toEqual({
      maxMessageChars: 1500,
      maxTurns: 16,
      chatPerWindow: 20,
      leadPerWindow: 5,
      windowMs: 600000,
      maxOutputTokens: 2048,
    });
  });

  it("has the documented default strings", () => {
    expect(DEFAULT_STRINGS.launcherOpen).toBe("Open chat");
    expect(DEFAULT_STRINGS.leadSubmit).toBe("Start chat");
    expect(DEFAULT_STRINGS.callbackDone).toBe("Thanks. We will call you back.");
    expect(DEFAULT_STRINGS.errorRateLimited).toBe(
      "You have sent a lot of messages. Please wait a few minutes or call us.",
    );
    expect(DEFAULT_STRINGS.greetingDismiss).toBe("Dismiss");
    expect(Object.keys(DEFAULT_STRINGS)).toHaveLength(22);
  });

  it("keeps strings free of dash code points and exclamation marks", () => {
    for (const value of Object.values(DEFAULT_STRINGS)) {
      expect(value).not.toMatch(/[\u2014\u2013!]/);
    }
  });

  it("uses a given persona label", () => {
    const config = defineChatConfig({ ...base, persona: { name: "Sam", label: "Helper" } });
    expect(config.persona.label).toBe("Helper");
  });
});

describe("defineChatConfig merging", () => {
  it("merges partial limits over the defaults", () => {
    const config = defineChatConfig({ ...base, limits: { maxTurns: 8, windowMs: 1000 } });
    expect(config.limits).toEqual({ ...DEFAULT_LIMITS, maxTurns: 8, windowMs: 1000 });
  });

  it("merges partial strings over the defaults", () => {
    const config = defineChatConfig({ ...base, strings: { send: "Go" } });
    expect(config.strings.send).toBe("Go");
    expect(config.strings.stop).toBe(DEFAULT_STRINGS.stop);
  });

  it("ignores undefined entries in partial limits and strings", () => {
    const config = defineChatConfig({
      ...base,
      limits: { maxTurns: undefined },
      strings: { send: undefined },
    });
    expect(config.limits.maxTurns).toBe(DEFAULT_LIMITS.maxTurns);
    expect(config.strings.send).toBe(DEFAULT_STRINGS.send);
  });

  it("does not share default objects between configs", () => {
    const a = defineChatConfig(base);
    a.limits.maxTurns = 1;
    a.strings.send = "changed";
    expect(DEFAULT_LIMITS.maxTurns).toBe(16);
    expect(DEFAULT_STRINGS.send).toBe("Send");
    expect(defineChatConfig(base).limits.maxTurns).toBe(16);
  });

  it("accepts the optional fields", () => {
    const config = defineChatConfig({
      ...base,
      privacyUrl: "https://example.com/privacy",
      demoNotice: "This is a demo.",
      accent: "#AABBCC",
      leadMode: "off",
      greetingDelayMs: 0,
      suggestions: ["a", "b", "c"],
    });
    expect(config.privacyUrl).toBe("https://example.com/privacy");
    expect(config.demoNotice).toBe("This is a demo.");
    expect(config.accent).toBe("#AABBCC");
    expect(config.leadMode).toBe("off");
    expect(config.greetingDelayMs).toBe(0);
    expect(config.suggestions).toHaveLength(3);
  });

  it("accepts a root relative privacy url", () => {
    expect(defineChatConfig({ ...base, privacyUrl: "/privacy" }).privacyUrl).toBe("/privacy");
  });
});

describe("defineChatConfig validation", () => {
  it("rejects an empty persona name", () => {
    expect(() => defineChatConfig({ ...base, persona: { name: "" } })).toThrow(/persona\.name/);
    expect(() => defineChatConfig({ ...base, persona: { name: "   " } })).toThrow(/persona\.name/);
  });

  it("rejects an empty greeting", () => {
    expect(() => defineChatConfig({ ...base, greeting: "" })).toThrow(/greeting/);
  });

  it("rejects more than three suggestions", () => {
    expect(() => defineChatConfig({ ...base, suggestions: ["a", "b", "c", "d"] })).toThrow(
      /suggestions/,
    );
  });

  it("rejects empty topics", () => {
    expect(() => defineChatConfig({ ...base, topics: [] })).toThrow(/topics/);
  });

  it("rejects an unknown lead mode", () => {
    expect(() =>
      defineChatConfig({ ...base, leadMode: "sometimes" as unknown as "required" }),
    ).toThrow(/leadMode/);
  });

  it.each(Object.keys(DEFAULT_LIMITS) as (keyof ChatLimits)[])(
    "rejects a non positive or non integer %s",
    (key) => {
      for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => defineChatConfig({ ...base, limits: { [key]: bad } })).toThrow(
          new RegExp(`limits\\.${key}`),
        );
      }
    },
  );

  it("rejects a negative greeting delay", () => {
    expect(() => defineChatConfig({ ...base, greetingDelayMs: -1 })).toThrow(/greetingDelayMs/);
  });

  it("rejects a bad accent", () => {
    for (const bad of ["red", "#fff", "0f766e", "#0f766eff", "#gggggg"]) {
      expect(() => defineChatConfig({ ...base, accent: bad })).toThrow(/accent/);
    }
  });

  it("rejects a privacy url that is not root relative or https", () => {
    for (const bad of ["http://example.com/p", "privacy", "javascript:alert(1)"]) {
      expect(() => defineChatConfig({ ...base, privacyUrl: bad })).toThrow(/privacyUrl/);
    }
  });

  it("throws plain Error instances", () => {
    expect(() => defineChatConfig({ ...base, greeting: "" })).toThrow(Error);
  });
});

describe("toPublicConfig", () => {
  const publicConfig = toPublicConfig(testConfig, testContent);

  it("derives site and contact fields from the content", () => {
    expect(publicConfig.businessName).toBe("Test Loaf Bakery");
    expect(publicConfig.phone).toBe("555-0100");
    expect(publicConfig.phoneHref).toBe("tel:+15550100");
    expect(publicConfig.siteHost).toBe("testloaf.example");
  });

  it("includes the port in the host", () => {
    const withPort = toPublicConfig(testConfig, {
      ...testContent,
      siteUrl: "http://localhost:3000",
    });
    expect(withPort.siteHost).toBe("localhost:3000");
  });

  it("carries the widget fields from the config", () => {
    expect(publicConfig.persona).toEqual({ name: "Sam", label: "AI assistant" });
    expect(publicConfig.greeting).toBe("Hi");
    expect(publicConfig.greetingDelayMs).toBe(5000);
    expect(publicConfig.leadMode).toBe("required");
    expect(publicConfig.accent).toBe("#0f766e");
    expect(publicConfig.strings).toEqual(DEFAULT_STRINGS);
    expect(publicConfig.maxMessageChars).toBe(1500);
  });

  it("does not expose topics, extraRules or limits", () => {
    const keys = Object.keys(publicConfig);
    expect(keys).not.toContain("topics");
    expect(keys).not.toContain("extraRules");
    expect(keys).not.toContain("limits");
    expect(JSON.stringify(publicConfig)).not.toContain("Never discuss allergens");
    expect(JSON.stringify(publicConfig)).not.toContain("maxTurns");
  });

  it("passes through privacy url and demo notice when set", () => {
    const config = defineChatConfig({
      persona: { name: "Sam" },
      greeting: "Hi",
      topics: ["bread"],
      privacyUrl: "/privacy",
      demoNotice: "Demo only.",
    });
    const result = toPublicConfig(config, testContent);
    expect(result.privacyUrl).toBe("/privacy");
    expect(result.demoNotice).toBe("Demo only.");
  });
});
