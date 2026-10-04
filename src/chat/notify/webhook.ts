import { NotifyError, type FetchLike, type Lead, type LeadNotifier } from "./types";

const TIMEOUT_MS = 10000;

export function createWebhookNotifier(options: {
  url: string;
  fetchImpl?: FetchLike;
}): LeadNotifier {
  const send: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const { url } = options;

  return {
    name: "webhook",
    async notify(lead: Lead): Promise<void> {
      const response = await send(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat.lead",
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          page: lead.page,
          receivedAt: lead.receivedAt,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok)
        throw new NotifyError(`webhook responded ${response.status}`, response.status);
    },
  };
}
