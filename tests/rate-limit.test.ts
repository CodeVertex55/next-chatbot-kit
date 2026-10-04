import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore, checkRateLimit } from "@/chat/rate-limit";

describe("MemoryRateLimitStore", () => {
  it("counts hits within a window", async () => {
    const store = new MemoryRateLimitStore();
    expect((await store.hit("a", 1000, 0)).count).toBe(1);
    expect((await store.hit("a", 1000, 500)).count).toBe(2);
    expect((await store.hit("a", 1000, 999)).count).toBe(3);
  });

  it("reports a stable resetAt for the window", async () => {
    const store = new MemoryRateLimitStore();
    const first = await store.hit("a", 1000, 100);
    const second = await store.hit("a", 1000, 600);
    expect(first.resetAt).toBe(1100);
    expect(second.resetAt).toBe(1100);
  });

  it("starts a new window after the old one expires", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("a", 1000, 0);
    await store.hit("a", 1000, 10);
    const next = await store.hit("a", 1000, 1000);
    expect(next).toEqual({ count: 1, resetAt: 2000 });
  });

  it("keeps separate counts per key", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("a", 1000, 0);
    await store.hit("a", 1000, 0);
    expect((await store.hit("b", 1000, 0)).count).toBe(1);
    expect((await store.hit("a", 1000, 0)).count).toBe(3);
  });

  it("deletes expired entries once the map passes maxKeys", async () => {
    const store = new MemoryRateLimitStore(3);
    await store.hit("a", 100, 0);
    await store.hit("b", 100, 0);
    await store.hit("c", 100, 50);
    // The fourth key pushes the map over maxKeys. a, b and c are all expired by now.
    await store.hit("d", 100, 500);
    // c was pruned as expired, so it starts again at 1.
    expect((await store.hit("c", 100, 500)).count).toBe(1);
  });

  it("deletes the oldest entry when still over maxKeys after pruning", async () => {
    const store = new MemoryRateLimitStore(2);
    await store.hit("a", 10000, 0);
    await store.hit("b", 10000, 1);
    await store.hit("c", 10000, 2);
    // c survived, so its count continues.
    expect((await store.hit("c", 10000, 3)).count).toBe(2);
    // a was the oldest and was dropped, so it starts over.
    expect((await store.hit("a", 10000, 4)).count).toBe(1);
  });

  it("stays bounded under many keys", async () => {
    const store = new MemoryRateLimitStore(5);
    for (let i = 0; i < 100; i += 1) await store.hit(`k${i}`, 100000, i);
    // Only the most recent keys can still be counting.
    expect((await store.hit("k99", 100000, 200)).count).toBe(2);
    expect((await store.hit("k0", 100000, 200)).count).toBe(1);
  });
});

describe("checkRateLimit", () => {
  it("allows hits up to the max", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit(store, "k", 3, 60000, 0)).allowed).toBe(true);
    }
    expect((await checkRateLimit(store, "k", 3, 60000, 0)).allowed).toBe(false);
  });

  it("reports retryAfterSeconds as the ceiling of the time to reset", async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, "k", 1, 60000, 0);
    const blocked = await checkRateLimit(store, "k", 1, 60000, 1500);
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 59 });
    const nearEnd = await checkRateLimit(store, "k", 1, 60000, 59001);
    expect(nearEnd.retryAfterSeconds).toBe(1);
  });

  it("never reports less than one second", async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, "k", 1, 1000, 0);
    const blocked = await checkRateLimit(store, "k", 1, 1000, 999);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("allows again after the window with a later now", async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, "k", 1, 1000, 0);
    expect((await checkRateLimit(store, "k", 1, 1000, 500)).allowed).toBe(false);
    expect((await checkRateLimit(store, "k", 1, 1000, 1000)).allowed).toBe(true);
  });

  it("limits keys independently", async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, "one", 1, 1000, 0);
    expect((await checkRateLimit(store, "one", 1, 1000, 0)).allowed).toBe(false);
    expect((await checkRateLimit(store, "two", 1, 1000, 0)).allowed).toBe(true);
  });
});
