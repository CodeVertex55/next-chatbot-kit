import { describe, expect, it } from "vitest";
import { DailyBudget, parseDailyLimit } from "@/chat/budget";

const DAY = 24 * 60 * 60 * 1000;
const day0 = Date.UTC(2026, 0, 10, 12, 0, 0);

describe("parseDailyLimit", () => {
  it("returns null for unset or empty values", () => {
    expect(parseDailyLimit(undefined)).toBeNull();
    expect(parseDailyLimit("")).toBeNull();
    expect(parseDailyLimit("   ")).toBeNull();
  });

  it("returns null for non-numeric values", () => {
    expect(parseDailyLimit("abc")).toBeNull();
    expect(parseDailyLimit("NaN")).toBeNull();
    expect(parseDailyLimit("Infinity")).toBeNull();
    expect(parseDailyLimit("1e3")).toBeNull();
    expect(parseDailyLimit("0x10")).toBeNull();
    expect(parseDailyLimit("12.9")).toBeNull();
    expect(parseDailyLimit("0.5")).toBeNull();
  });

  it("returns null for negative values", () => {
    expect(parseDailyLimit("-5")).toBeNull();
    expect(parseDailyLimit("-0")).toBeNull();
  });

  it("treats zero as a limit of zero calls", () => {
    expect(parseDailyLimit("0")).toBe(0);
    expect(parseDailyLimit(" 0 ")).toBe(0);
    expect(parseDailyLimit("000")).toBe(0);
  });

  it("parses plain whole numbers", () => {
    expect(parseDailyLimit("1")).toBe(1);
    expect(parseDailyLimit(" 250 ")).toBe(250);
  });
});

describe("DailyBudget", () => {
  it("always allows when the limit is null", () => {
    const budget = new DailyBudget(null);
    for (let i = 0; i < 1000; i += 1) expect(budget.tryConsume(day0)).toBe(true);
  });

  it("refuses every call when the limit is zero", () => {
    const budget = new DailyBudget(0);
    expect(budget.tryConsume(day0)).toBe(false);
    expect(budget.tryConsume(day0 + DAY)).toBe(false);
  });

  it("allows up to the limit and then refuses", () => {
    const budget = new DailyBudget(3);
    expect(budget.tryConsume(day0)).toBe(true);
    expect(budget.tryConsume(day0 + 1000)).toBe(true);
    expect(budget.tryConsume(day0 + 2000)).toBe(true);
    expect(budget.tryConsume(day0 + 3000)).toBe(false);
    expect(budget.tryConsume(day0 + 4000)).toBe(false);
  });

  it("does not carry refused attempts into the next day", () => {
    const budget = new DailyBudget(1);
    expect(budget.tryConsume(day0)).toBe(true);
    expect(budget.tryConsume(day0)).toBe(false);
    expect(budget.tryConsume(day0 + DAY)).toBe(true);
    expect(budget.tryConsume(day0 + DAY)).toBe(false);
  });

  it("resets when the UTC day changes", () => {
    const budget = new DailyBudget(2);
    const lateEvening = Date.UTC(2026, 0, 10, 23, 59, 59);
    const justAfterMidnight = Date.UTC(2026, 0, 11, 0, 0, 0);
    expect(budget.tryConsume(lateEvening)).toBe(true);
    expect(budget.tryConsume(lateEvening)).toBe(true);
    expect(budget.tryConsume(lateEvening)).toBe(false);
    expect(budget.tryConsume(justAfterMidnight)).toBe(true);
    expect(budget.tryConsume(justAfterMidnight)).toBe(true);
    expect(budget.tryConsume(justAfterMidnight)).toBe(false);
  });
});
