// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYS, readStored, removeStored, writeStored } from "@/chat/widget/storage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("storage", () => {
  it("round trips a value in each area", () => {
    writeStored("local", "k", "a");
    writeStored("session", "k", "b");
    expect(readStored("local", "k")).toBe("a");
    expect(readStored("session", "k")).toBe("b");
    removeStored("local", "k");
    expect(readStored("local", "k")).toBeNull();
    expect(readStored("session", "k")).toBe("b");
  });

  it("returns null when the key is missing", () => {
    expect(readStored("local", "missing")).toBeNull();
  });

  it("returns null and does not throw when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStored("local", "k")).toBeNull();
    expect(readStored("session", "k")).toBeNull();
  });

  it("does not throw when setItem or removeItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeStored("local", "k", "v")).not.toThrow();
    expect(() => removeStored("session", "k")).not.toThrow();
  });

  it("does not throw when the storage object itself is unavailable", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStored("local", "k")).toBeNull();
    expect(() => writeStored("local", "k", "v")).not.toThrow();
  });

  it("exposes the storage keys", () => {
    expect(KEYS).toEqual({
      greetingDismissed: "chatkit:greeting",
      leadDone: "chatkit:lead",
      conversation: "chatkit:conversation",
    });
  });
});
