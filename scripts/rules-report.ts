/** Formatting for the live rules check, kept apart from the script so it can be tested. */

export interface CaseResult {
  id: string;
  /** What went wrong, or null when the checks passed. */
  failure: string | null;
  /** True when the reply as the model wrote it held a dash character. Reported only. */
  rawDash: boolean;
}

export interface TokenTotals {
  input: number;
  cacheRead: number;
  output: number;
}

/** The results as a plain text table. The raw dash column never counts as a failure. */
export function formatTable(results: CaseResult[]): string {
  const width = Math.max(...results.map((result) => result.id.length), "case".length);
  const line = (id: string, status: string, rawDash: string, note: string): string =>
    `${id.padEnd(width)}  ${status.padEnd(6)}  ${rawDash.padEnd(8)}  ${note}`.trimEnd();
  const rows = results.map((result) =>
    line(
      result.id,
      result.failure === null ? "pass" : "FAIL",
      result.rawDash ? "yes" : "no",
      result.failure ?? "",
    ),
  );
  return [line("case", "result", "raw dash", "failing check"), ...rows].join("\n");
}

/** Input, cache read and output tokens, each on its own. */
export function formatTokens(tokens: TokenTotals): string {
  return `Tokens used: ${tokens.input} input, ${tokens.cacheRead} cache read, ${tokens.output} output.`;
}
