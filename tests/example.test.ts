import { describe, expect, it } from "vitest";
import { buildSystemPrompt, toPublicConfig } from "@/chat";
import { chatConfig } from "@/chat.config";
import { business, buildPages, navPages, normaliseSiteUrl } from "@/content/business";

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

  it("lists every service price, as written, in the prompt", () => {
    for (const service of business.services) {
      expect(service.price).toBeDefined();
      expect(prompt).toContain(`${service.name}: ${service.summary} Price: ${service.price}.`);
    }
  });

  it("prices the remaining treatments after an examination, stated once", () => {
    const unpriced = business.services.filter(
      (service) => !PUBLISHED_PRICES.some((p) => p === service.price),
    );
    expect(unpriced.length).toBeGreaterThanOrEqual(5);
    for (const service of unpriced) {
      expect(service.price).toBe("after an examination");
      expect(service.summary.toLowerCase()).not.toContain("after an examination");
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

describe("example practice navigation and pages", () => {
  it("has nav paths that each start with a single slash", () => {
    expect(navPages.length).toBeGreaterThanOrEqual(4);
    for (const page of navPages) {
      expect(page.path).toMatch(/^\/(?!\/)/);
    }
  });

  it("normalises a site address with trailing slashes", () => {
    expect(normaliseSiteUrl("https://example.com/")).toBe("https://example.com");
    expect(normaliseSiteUrl("  https://example.com//  ")).toBe("https://example.com");
    expect(normaliseSiteUrl("")).toBe("http://localhost:3000");
    expect(normaliseSiteUrl(undefined)).toBe("http://localhost:3000");
  });

  it("builds page addresses with no double slash after the origin", () => {
    for (const raw of ["https://example.com", "https://example.com/", "https://example.com///"]) {
      const pages = buildPages(normaliseSiteUrl(raw));
      expect(pages).toHaveLength(navPages.length);
      for (const page of pages) {
        expect(page.url.slice("https://".length)).not.toContain("//");
        expect(new URL(page.url).host).toBe("example.com");
      }
    }
  });

  it("uses the same pages in the business content", () => {
    expect(business.pages.map((page) => page.title)).toEqual(navPages.map((page) => page.title));
  });
});
