import type { BusinessContent } from "@/chat/content";
import { defineChatConfig } from "@/chat/config";

export const testContent: BusinessContent = {
  name: "Test Loaf Bakery",
  description: "a small neighbourhood bakery",
  siteUrl: "https://testloaf.example",
  phone: "555-0100",
  phoneHref: "tel:+15550100",
  emergencyPhone: "555-0101",
  email: "hello@testloaf.example",
  address: "12 Rye Lane, Testville",
  bookingUrl: "https://testloaf.example/orders",
  hours: [
    { days: "Monday to Friday", hours: "7am to 4pm" },
    { days: "Saturday", hours: "8am to 1pm" },
  ],
  hoursNote: "Closed on public holidays.",
  services: [
    { name: "Sourdough loaf", summary: "Baked fresh each morning.", price: "$7" },
    { name: "Custom cakes", summary: "Made to order for events." },
  ],
  pricingNote: "Custom cake prices are confirmed by the bakers after a short consultation.",
  serviceArea: "Testville and nearby suburbs",
  team: [{ name: "Alex Baker", role: "Head baker" }],
  policies: [{ title: "Pre-orders", text: "Cake orders need three days notice." }],
  faqs: [{ question: "Do you sell gluten free bread?", answer: "Not at the moment." }],
  pages: [{ title: "Menu", url: "https://testloaf.example/menu" }],
};

export const testConfig = defineChatConfig({
  persona: { name: "Sam" },
  greeting: "Hi",
  topics: ["bread", "hours"],
  extraRules: ["Never discuss allergens beyond the published list."],
});
