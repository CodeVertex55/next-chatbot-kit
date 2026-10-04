import { renderCallbackEmail } from "../email/template";
import type { FetchLike, Lead, LeadNotifier } from "./types";

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10000;

export interface ResendOptions {
  apiKey: string;
  to: string;
  from: string;
  businessName: string;
  siteUrl: string;
  accent: string;
  fetchImpl?: FetchLike;
}

export function createResendNotifier(options: ResendOptions): LeadNotifier {
  const send: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const { apiKey, to, from, businessName, siteUrl, accent } = options;

  return {
    name: "resend",
    async notify(lead: Lead): Promise<void> {
      const email = renderCallbackEmail(lead, { businessName, siteUrl, accent });
      const response = await send(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: lead.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`resend responded ${response.status}`);
    },
  };
}
