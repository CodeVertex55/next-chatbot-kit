export const DEFAULT_MODEL = "claude-opus-5-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const FALLBACK_MODELS: readonly string[] = [
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
];

/** Decides which optional request parameters a model id gets. */
export function modelOptions(model: string): { useEffort: boolean; useFallbacks: boolean } {
  return {
    useEffort: !model.startsWith("claude-haiku"),
    useFallbacks: FALLBACK_MODELS.includes(model),
  };
}
