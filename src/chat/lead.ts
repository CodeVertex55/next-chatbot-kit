import type { Lead } from "./notify/types";

export type LeadField = "name" | "phone" | "email" | "page";

export type LeadResult =
  | { ok: true; honeypot: boolean; lead: Omit<Lead, "receivedAt"> }
  | { ok: false; errors: Partial<Record<LeadField, string>> };

const NAME_MIN = 2;
const NAME_MAX = 80;
const PHONE_MIN = 7;
const PHONE_MAX = 20;
const MIN_DIGITS = 7;
const EMAIL_MAX = 254;
const PAGE_MAX = 300;

const LOCAL_MAX = 64;
const LABEL_MAX = 63;

/** C0 and C1 controls, the delete character, and the two Unicode line separators. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const PHONE_SHAPE = /^\+?[0-9().-]+$/;

const MESSAGES = {
  name: "Enter your name.",
  phone: "Enter a valid phone number.",
  email: "Enter a valid email address.",
  pageLength: "Page is too long.",
  pageInvalid: "Page is not valid.",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The trimmed text of a field, or null when it is not text or holds control characters. */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return CONTROL.test(text) ? null : text;
}

function countDigits(text: string): number {
  let digits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 48 && code <= 57) digits += 1;
  }
  return digits;
}

function validName(text: string | null): text is string {
  return text !== null && text.length >= NAME_MIN && text.length <= NAME_MAX;
}

function validPhone(text: string | null): text is string {
  if (text === null) return false;
  const compact = text.split(" ").join("");
  return (
    compact.length >= PHONE_MIN &&
    compact.length <= PHONE_MAX &&
    PHONE_SHAPE.test(compact) &&
    countDigits(compact) >= MIN_DIGITS
  );
}

function isLetterOrDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0 to 9
    (code >= 65 && code <= 90) || // A to Z
    (code >= 97 && code <= 122) // a to z
  );
}

/** One to 64 characters of letters, digits and . _ % + -, with no leading, trailing or doubled dot. */
function validLocalPart(local: string): boolean {
  if (local.length < 1 || local.length > LOCAL_MAX) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  for (let i = 0; i < local.length; i += 1) {
    const code = local.charCodeAt(i);
    if (!isLetterOrDigit(code) && !".-_%+".includes(local.charAt(i))) return false;
  }
  return true;
}

/** One to 63 characters of letters, digits and hyphens, not starting or ending with a hyphen. */
function validLabel(label: string): boolean {
  if (label.length < 1 || label.length > LABEL_MAX) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  for (let i = 0; i < label.length; i += 1) {
    if (!isLetterOrDigit(label.charCodeAt(i)) && label.charAt(i) !== "-") return false;
  }
  return true;
}

/**
 * A linear-time check with no backtracking. One at sign, a plain local part and a
 * domain of at least two valid labels. It is deliberately stricter than the
 * standard, so every accepted address is safe to place in a reply-to header.
 */
function validEmail(text: string | null): text is string {
  if (text === null || text.length > EMAIL_MAX) return false;
  const at = text.indexOf("@");
  if (at === -1 || at !== text.lastIndexOf("@")) return false;
  const labels = text.slice(at + 1).split(".");
  return (
    validLocalPart(text.slice(0, at)) &&
    labels.length >= 2 &&
    labels.every((label) => validLabel(label))
  );
}

/** Checks the callback form fields. Error text never echoes the input. */
export function validateLead(value: unknown): LeadResult {
  const input = isRecord(value) ? value : {};
  const company = typeof input.company === "string" ? input.company.trim() : "";
  const honeypot = company !== "";

  const name = cleanText(input.name);
  const phone = cleanText(input.phone);
  const email = cleanText(input.email);

  const errors: Partial<Record<LeadField, string>> = {};
  if (!validName(name)) errors.name = MESSAGES.name;
  if (!validPhone(phone)) errors.phone = MESSAGES.phone;
  if (!validEmail(email)) errors.email = MESSAGES.email;

  let page: string | undefined;
  const rawPage = input.page;
  if (rawPage !== undefined && rawPage !== null) {
    const text = cleanText(rawPage);
    if (text === null) {
      errors.page = MESSAGES.pageInvalid;
    } else if (text.length > PAGE_MAX) {
      errors.page = MESSAGES.pageLength;
    } else if (text !== "") {
      page = text;
    }
  }

  if (Object.keys(errors).length > 0 && !honeypot) return { ok: false, errors };

  const lead: Omit<Lead, "receivedAt"> = {
    name: validName(name) ? name : "",
    phone: validPhone(phone) ? phone : "",
    email: validEmail(email) ? email : "",
  };
  if (page !== undefined) lead.page = page;
  return { ok: true, honeypot, lead };
}
