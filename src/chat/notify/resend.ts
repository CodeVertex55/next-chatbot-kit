import { renderCallbackEmail } from "../email/template";
import { NotifyError, discardBody, type FetchLike, type Lead, type LeadNotifier } from "./types";

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10000;

/** A 4xx answer that points at the request itself, not the key, the account or the rate. */
function retriesWithoutReplyTo(status: number): boolean {
  return status >= 400 && status < 500 && ![401, 403, 429].includes(status);
}

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
      const post = (replyTo: string | null): Promise<Response> =>
        send(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [to],
            ...(replyTo === null ? {} : { reply_to: replyTo }),
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

      let response = await post(lead.email);
      // A rejected request is most often a reply-to address the service will not
      // take. Send the lead once more without it so the visitor's details still arrive.
      if (retriesWithoutReplyTo(response.status)) {
        discardBody(response);
        response = await post(null);
      }
      if (!response.ok) {
        discardBody(response);
        throw new NotifyError(`resend responded ${response.status}`, response.status);
      }
    },
  };
}
