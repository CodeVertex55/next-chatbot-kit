/**
 * The numeric status a thrown value carries, as text for a log line, or "none".
 * The message is never read, because it can quote request text.
 */
export function errorStatus(error: unknown): string {
  if (typeof error !== "object" || error === null) return "none";
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? String(status) : "none";
}
