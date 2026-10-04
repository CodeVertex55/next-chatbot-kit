import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, FALLBACK_BETA, modelOptions } from "@/chat/model";

describe("model constants", () => {
  it("uses the documented defaults", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
  });
});

describe("modelOptions", () => {
  it.each(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"])(
    "enables effort and fallbacks for %s",
    (id) => {
      expect(modelOptions(id)).toEqual({ useEffort: true, useFallbacks: true });
    },
  );

  it("disables effort and fallbacks for Haiku models", () => {
    expect(modelOptions("claude-haiku-4-5")).toEqual({ useEffort: false, useFallbacks: false });
    expect(modelOptions("claude-haiku-5")).toEqual({ useEffort: false, useFallbacks: false });
  });

  it("uses effort but no fallbacks for an unknown id", () => {
    expect(modelOptions("claude-something-else")).toEqual({
      useEffort: true,
      useFallbacks: false,
    });
  });

  it("does not match ids that only share a prefix with a fallback model", () => {
    expect(modelOptions("claude-opus-5-5-preview")).toEqual({
      useEffort: true,
      useFallbacks: false,
    });
  });
});
