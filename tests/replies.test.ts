import { describe, expect, it } from "vitest";
import { fallbackReply, holdingReply, interruptedSuffix } from "@/chat/replies";
import { testContent } from "./fixtures";

describe("replies", () => {
  it("holding reply names the phone and email", () => {
    expect(holdingReply(testContent)).toBe(
      "Thanks for your message. Our chat assistant is not available right now. Please call 555-0100 or email hello@testloaf.example and we will be glad to help.",
    );
  });

  it("fallback reply names the phone and email", () => {
    expect(fallbackReply(testContent)).toBe(
      "Sorry, I could not answer that. Please call 555-0100 or email hello@testloaf.example and we will help.",
    );
  });

  it("interrupted suffix names the phone and starts with a space", () => {
    expect(interruptedSuffix(testContent)).toBe(
      " Sorry, something went wrong. Please call 555-0100.",
    );
  });

  it("contains the phone and email where expected", () => {
    for (const reply of [holdingReply(testContent), fallbackReply(testContent)]) {
      expect(reply).toContain(testContent.phone);
      expect(reply).toContain(testContent.email);
    }
    expect(interruptedSuffix(testContent)).toContain(testContent.phone);
  });

  it("uses no dash code points and no exclamation marks", () => {
    for (const reply of [
      holdingReply(testContent),
      fallbackReply(testContent),
      interruptedSuffix(testContent),
    ]) {
      expect(reply).not.toMatch(/[\u2014\u2013!]/);
    }
  });
});
