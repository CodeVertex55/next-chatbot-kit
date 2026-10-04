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

const CONTROL = /[\u0000-\u001f\u007f]/;
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

/** A linear-time check: one at sign, a local part, and a domain with an inner dot. */
function validEmail(text: string | null): text is string {
  if (text === null || text.length > EMAIL_MAX || text.includes(" ")) return false;
  const parts = text.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local === undefined || domain === undefined || local === "") return false;
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
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
