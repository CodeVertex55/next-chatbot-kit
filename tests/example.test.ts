import { describe, expect, it } from "vitest";
import { buildSystemPrompt, toPublicConfig } from "@/chat";
import { chatConfig } from "@/chat.config";
import { business } from "@/content/business";

const PUBLISHED_PRICES = ["from $65", "from $45", "from $80", "from $25 each", "from $95"] as const;

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

describe("example practice system prompt", () => {
  const prompt = buildSystemPrompt(business, chatConfig);

  it("contains each published price string", () => {
    for (const price of PUBLISHED_PRICES) {
      expect(prompt).toContain(price);
    }
  });

  it("gives every priced service its price in the prompt", () => {
    const priced = business.services.filter((service) => service.price !== undefined);
    expect(priced.length).toBe(PUBLISHED_PRICES.length);
    for (const service of priced) {
      expect(prompt).toContain(`${service.name}: ${service.summary} Price: ${service.price}.`);
    }
  });

  it("states that the remaining treatments are priced after an examination", () => {
    const unpriced = business.services.filter((service) => service.price === undefined);
    expect(unpriced.length).toBeGreaterThanOrEqual(5);
    for (const service of unpriced) {
      expect(service.summary.toLowerCase()).toContain("after an examination");
    }
  });

  it("contains each extra rule", () => {
    expect(chatConfig.extraRules).toHaveLength(4);
    for (const rule of chatConfig.extraRules) {
      expect(prompt).toContain(rule);
    }
  });

  it("contains the emergency phone and the pricing note", () => {
    expect(business.emergencyPhone).toBe("555-0143");
    expect(prompt).toContain("555-0143");
    expect(prompt).toContain(business.pricingNote);
  });

  it("contains no em dash or en dash", () => {
    expect(prompt).not.toContain(EM_DASH);
    expect(prompt).not.toContain(EN_DASH);
  });

  it("has twelve questions and three team members", () => {
    expect(business.faqs).toHaveLength(12);
    expect(business.team).toHaveLength(3);
  });
});

describe("example practice public config", () => {
  const publicConfig = toPublicConfig(chatConfig, business);
  const json = JSON.stringify(publicConfig);

  it("serialises to JSON without extraRules", () => {
    expect(json).not.toContain("extraRules");
    for (const rule of chatConfig.extraRules) {
      expect(json).not.toContain(rule);
    }
  });

  it("carries the public values the widget needs", () => {
    expect(publicConfig.phone).toBe("555-0142");
    expect(publicConfig.leadMode).toBe("optional");
    expect(publicConfig.privacyUrl).toBe("/privacy");
    expect(publicConfig.demoNotice).toContain("This is a demo.");
  });
});
