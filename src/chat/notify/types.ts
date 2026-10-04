export interface Lead {
  name: string;
  phone: string;
  email: string;
  page?: string;
  receivedAt: string;
}

export interface LeadNotifier {
  name: string;
  notify(lead: Lead): Promise<void>;
}

/** Thrown when a delivery service answers with an error status. Never holds response text. */
export class NotifyError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Gives up on a response body that will not be read, so the connection can be reused. */
export function discardBody(response: Response): void {
  response.body?.cancel().catch(() => undefined);
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
