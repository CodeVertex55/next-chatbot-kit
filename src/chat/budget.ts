/**
 * Reads a daily call limit from an environment value. Only plain decimal digits
 * count as a number, and 0 means no model calls at all. Anything else, such as
 * an unset, empty, negative or non-numeric value, means no limit.
 */
export function parseDailyLimit(value: string | undefined): number | null {
  const text = value?.trim() ?? "";
  if (!/^[0-9]+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Counts model calls per UTC day. A null limit never refuses and a limit of 0 always does. */
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
