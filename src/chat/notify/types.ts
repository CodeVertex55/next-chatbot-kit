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

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
