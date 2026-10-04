import type { ChatConfig } from "../config";
import type { BusinessContent } from "../content";
import { createConsoleNotifier } from "./console";
import { createResendNotifier } from "./resend";
import type { FetchLike, LeadNotifier } from "./types";
import { createWebhookNotifier } from "./webhook";

export { createConsoleNotifier } from "./console";
export { createResendNotifier } from "./resend";
export { createWebhookNotifier } from "./webhook";
export type { FetchLike, Lead, LeadNotifier } from "./types";

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

function filled(value: string | undefined): string {
  return value?.trim() ?? "";
}

function acceptableWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname);
}

/** Builds the notifiers the environment asks for. Falls back to the console notifier. */
export function notifiersFromEnv(
  env: Record<string, string | undefined>,
  options: {
    content: BusinessContent;
    config: ChatConfig;
    fetchImpl?: FetchLike;
    log?: (line: string) => void;
  },
): LeadNotifier[] {
  const { content, config, fetchImpl, log } = options;
  const write = log ?? ((line: string) => console.log(line));
  const notifiers: LeadNotifier[] = [];

  const apiKey = filled(env.RESEND_API_KEY);
  const to = filled(env.LEAD_EMAIL_TO);
  const from = filled(env.LEAD_EMAIL_FROM);
  if (apiKey !== "" && to !== "" && from !== "") {
    notifiers.push(
      createResendNotifier({
        apiKey,
        to,
        from,
        businessName: content.name,
        siteUrl: content.siteUrl,
        accent: config.accent,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      }),
    );
  }

  const webhookUrl = filled(env.LEAD_WEBHOOK_URL);
  if (webhookUrl !== "") {
    if (acceptableWebhookUrl(webhookUrl)) {
      notifiers.push(
        createWebhookNotifier({
          url: webhookUrl,
          ...(fetchImpl === undefined ? {} : { fetchImpl }),
        }),
      );
    } else {
      write("lead webhook url ignored (must be https)");
    }
  }

  if (notifiers.length === 0) notifiers.push(createConsoleNotifier(write));
  return notifiers;
}
