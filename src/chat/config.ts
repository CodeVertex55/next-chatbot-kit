import type { BusinessContent } from "./content";

export type LeadMode = "required" | "optional" | "off";

export interface ChatLimits {
  maxMessageChars: number;
  maxTurns: number;
  chatPerWindow: number;
  leadPerWindow: number;
  windowMs: number;
  maxOutputTokens: number;
}

export interface ChatStrings {
  launcherOpen: string;
  launcherClose: string;
  panelLabel: string;
  leadTitle: string;
  leadIntro: string;
  nameLabel: string;
  phoneLabel: string;
  emailLabel: string;
  leadSubmit: string;
  leadSkip: string;
  leadSensitiveNote: string;
  privacyLinkText: string;
  callbackButton: string;
  callbackDone: string;
  composerLabel: string;
  composerPlaceholder: string;
  send: string;
  stop: string;
  typing: string;
  errorRateLimited: string;
  errorNetwork: string;
  greetingDismiss: string;
}

export interface ChatConfig {
  persona: { name: string; label: string };
  greeting: string;
  greetingDelayMs: number;
  suggestions: string[];
  topics: string[];
  extraRules: string[];
  leadMode: LeadMode;
  privacyUrl?: string;
  demoNotice?: string;
  accent: string;
  limits: ChatLimits;
  strings: ChatStrings;
}

export interface ChatConfigInput {
  persona: { name: string; label?: string };
  greeting: string;
  greetingDelayMs?: number;
  suggestions?: string[];
  topics: string[];
  extraRules?: string[];
  leadMode?: LeadMode;
  privacyUrl?: string;
  demoNotice?: string;
  accent?: string;
  limits?: Partial<ChatLimits>;
  strings?: Partial<ChatStrings>;
}

export const DEFAULT_LIMITS: ChatLimits = {
  maxMessageChars: 1500,
  maxTurns: 16,
  chatPerWindow: 20,
  leadPerWindow: 5,
  windowMs: 600000,
  maxOutputTokens: 2048,
};

export const DEFAULT_STRINGS: ChatStrings = {
  launcherOpen: "Open chat",
  launcherClose: "Close chat",
  panelLabel: "Chat",
  leadTitle: "Before we start",
  leadIntro: "Leave your details and we can call you back if needed.",
  nameLabel: "Name",
  phoneLabel: "Phone",
  emailLabel: "Email",
  leadSubmit: "Start chat",
  leadSkip: "Skip for now",
  leadSensitiveNote: "Please do not include medical or other sensitive details.",
  privacyLinkText: "Privacy policy",
  callbackButton: "Request a callback",
  callbackDone: "Thanks. We will call you back.",
  composerLabel: "Your message",
  composerPlaceholder: "Type your question",
  send: "Send",
  stop: "Stop",
  typing: "Typing",
  errorRateLimited: "You have sent a lot of messages. Please wait a few minutes or call us.",
  errorNetwork: "Something went wrong. Please try again or call us.",
  greetingDismiss: "Dismiss",
};

const DEFAULT_LABEL = "AI assistant";
const DEFAULT_GREETING_DELAY_MS = 5000;
const DEFAULT_ACCENT = "#0f766e";
const MAX_SUGGESTIONS = 3;
const LEAD_MODES: readonly LeadMode[] = ["required", "optional", "off"];

/** Copies the defined entries of `overrides` over `defaults`. */
function mergeDefined<T extends object>(defaults: T, overrides: Partial<T> | undefined): T {
  const merged = { ...defaults };
  if (!overrides) return merged;
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const value = overrides[key];
    if (value !== undefined) merged[key] = value as T[keyof T];
  }
  return merged;
}

function fail(field: string, problem: string): never {
  throw new Error(`Invalid chat config: ${field} ${problem}`);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function defineChatConfig(input: ChatConfigInput): ChatConfig {
  if (!isNonEmpty(input.persona?.name)) fail("persona.name", "must not be empty");
  if (!isNonEmpty(input.greeting)) fail("greeting", "must not be empty");

  const suggestions = input.suggestions ?? [];
  if (suggestions.length > MAX_SUGGESTIONS) {
    fail("suggestions", `must have at most ${MAX_SUGGESTIONS} entries`);
  }

  if (!Array.isArray(input.topics) || input.topics.length === 0) {
    fail("topics", "must have at least one entry");
  }

  const leadMode = input.leadMode ?? "required";
  if (!LEAD_MODES.includes(leadMode)) {
    fail("leadMode", `must be one of ${LEAD_MODES.join(", ")}`);
  }

  const greetingDelayMs = input.greetingDelayMs ?? DEFAULT_GREETING_DELAY_MS;
  if (!Number.isFinite(greetingDelayMs) || greetingDelayMs < 0) {
    fail("greetingDelayMs", "must be zero or more");
  }

  const accent = input.accent ?? DEFAULT_ACCENT;
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) {
    fail("accent", "must be a six digit hex colour such as #0f766e");
  }

  const { privacyUrl } = input;
  if (
    privacyUrl !== undefined &&
    !privacyUrl.startsWith("/") &&
    !privacyUrl.startsWith("https://")
  ) {
    fail("privacyUrl", "must start with / or https://");
  }

  const limits = mergeDefined(DEFAULT_LIMITS, input.limits);
  for (const key of Object.keys(limits) as (keyof ChatLimits)[]) {
    if (!Number.isInteger(limits[key]) || limits[key] <= 0) {
      fail(`limits.${key}`, "must be a positive integer");
    }
  }

  const config: ChatConfig = {
    persona: { name: input.persona.name, label: input.persona.label ?? DEFAULT_LABEL },
    greeting: input.greeting,
    greetingDelayMs,
    suggestions: [...suggestions],
    topics: [...input.topics],
    extraRules: [...(input.extraRules ?? [])],
    leadMode,
    accent,
    limits,
    strings: mergeDefined(DEFAULT_STRINGS, input.strings),
  };
  if (privacyUrl !== undefined) config.privacyUrl = privacyUrl;
  if (input.demoNotice !== undefined) config.demoNotice = input.demoNotice;
  return config;
}

export interface PublicChatConfig {
  businessName: string;
  persona: { name: string; label: string };
  greeting: string;
  greetingDelayMs: number;
  suggestions: string[];
  leadMode: LeadMode;
  privacyUrl?: string;
  demoNotice?: string;
  accent: string;
  strings: ChatStrings;
  phone: string;
  phoneHref: string;
  siteHost: string;
  maxMessageChars: number;
  maxTurns: number;
}

/** The part of the config that is safe to send to the browser. */
export function toPublicConfig(config: ChatConfig, content: BusinessContent): PublicChatConfig {
  const result: PublicChatConfig = {
    businessName: content.name,
    persona: { ...config.persona },
    greeting: config.greeting,
    greetingDelayMs: config.greetingDelayMs,
    suggestions: [...config.suggestions],
    leadMode: config.leadMode,
    accent: config.accent,
    strings: { ...config.strings },
    phone: content.phone,
    phoneHref: content.phoneHref,
    siteHost: new URL(content.siteUrl).host,
    maxMessageChars: config.limits.maxMessageChars,
    maxTurns: config.limits.maxTurns,
  };
  if (config.privacyUrl !== undefined) result.privacyUrl = config.privacyUrl;
  if (config.demoNotice !== undefined) result.demoNotice = config.demoNotice;
  return result;
}
