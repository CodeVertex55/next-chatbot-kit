export interface BusinessContent {
  /** Written exactly as the business writes it. */
  name: string;
  /** One line. */
  description: string;
  siteUrl: string;
  /** Display form. */
  phone: string;
  /** The tel: value. */
  phoneHref: string;
  emergencyPhone?: string;
  email: string;
  address?: string;
  /** Page that explains how to book. */
  bookingUrl: string;
  hours: { days: string; hours: string }[];
  hoursNote?: string;
  services: { name: string; summary: string; price?: string }[];
  /** Who gives a final price and after what. */
  pricingNote: string;
  serviceArea?: string;
  team?: { name: string; role: string }[];
  policies: { title: string; text: string }[];
  faqs: { question: string; answer: string }[];
  pages: { title: string; url: string }[];
}
