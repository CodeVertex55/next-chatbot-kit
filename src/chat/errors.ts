/**
 * Safe facts about a thrown value for a log line: the class name and a numeric
 * status when there is one. The message is never read, because it can quote
 * request text. Every error class in the Anthropic SDK keeps the name "Error",
 * so the class name is the useful part.
 */
export function describeError(error: unknown): { type: string; status: string } {
  if (typeof error !== "object" || error === null) return { type: "unknown", status: "none" };
  const type = error.constructor?.name;
  const status = (error as { status?: unknown }).status;
  return {
    type: typeof type === "string" && type !== "" ? type : "unknown",
    status: typeof status === "number" && Number.isInteger(status) ? String(status) : "none",
  };
}
