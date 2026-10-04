export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
}

interface Entry {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter held in process memory. Fine for one server. A shared
 * store implementing RateLimitStore is needed when running several instances.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, Entry>();
  private readonly maxKeys: number;

  constructor(maxKeys = 10000) {
    this.maxKeys = Math.max(1, Math.floor(maxKeys));
  }

  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }> {
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.resetAt > now) {
      existing.count += 1;
      return Promise.resolve({ count: existing.count, resetAt: existing.resetAt });
    }

    // A new window. Delete first so the key moves to the back of the map order.
    this.entries.delete(key);
    const entry: Entry = { count: 1, resetAt: now + windowMs };
    this.entries.set(key, entry);
    this.prune(now);
    return Promise.resolve({ count: entry.count, resetAt: entry.resetAt });
  }

  private prune(now: number): void {
    if (this.entries.size <= this.maxKeys) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxKeys) break;
      this.entries.delete(key);
    }
  }
}

export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { count, resetAt } = await store.hit(key, windowMs, now);
  return {
    allowed: count <= max,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}
