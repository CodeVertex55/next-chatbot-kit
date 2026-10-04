import type { LeadNotifier } from "./types";

/** Used when no real notifier is configured. Logs that a lead arrived, never what it held. */
export function createConsoleNotifier(
  log: (line: string) => void = (line) => console.log(line),
): LeadNotifier {
  return {
    name: "console",
    notify(): Promise<void> {
      log("lead received (no notifier configured)");
      return Promise.resolve();
    },
  };
}
