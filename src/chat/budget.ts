/** Reads a daily call limit from an environment value. Anything unusable means no limit. */
export function parseDailyLimit(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const whole = Math.floor(parsed);
  return whole < 1 ? null : whole;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Counts model calls per UTC day. A null limit never refuses. */
export class DailyBudget {
  private day = "";
  private count = 0;

  constructor(private readonly limit: number | null) {}

  tryConsume(now: number): boolean {
    if (this.limit === null) return true;
    const today = utcDay(now);
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
}
