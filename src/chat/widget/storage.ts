"use client";

export type StorageKind = "local" | "session";

export const KEYS = {
  greetingDismissed: "chatkit:greeting",
  leadDone: "chatkit:lead",
  conversation: "chatkit:conversation",
};

/** The storage area, or null when the browser blocks access to it. */
function area(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reads a value. Returns null when it is missing or storage is unavailable. */
export function readStored(kind: StorageKind, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes a value. Does nothing when storage is unavailable or full. */
export function writeStored(kind: StorageKind, key: string, value: string): void {
  try {
    area(kind)?.setItem(key, value);
  } catch {
    // Storage is blocked or full. The widget works without it.
  }
}

/** Removes a value. Does nothing when storage is unavailable. */
export function removeStored(kind: StorageKind, key: string): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Storage is blocked. The widget works without it.
  }
}
