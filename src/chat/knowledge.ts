import type { ChatConfig } from "./config";
import type { BusinessContent } from "./content";
import { buildRules } from "./rules";

interface Section {
  heading: string;
  lines: string[];
}

function sections(content: BusinessContent): Section[] {
  const business = [`Name: ${content.name}`];
  if (content.address) business.push(`Address: ${content.address}`);
  business.push(`Phone: ${content.phone}`);
  if (content.emergencyPhone) business.push(`Emergency phone: ${content.emergencyPhone}`);
  business.push(`Email: ${content.email}`);

  const hours = content.hours.map((entry) => `${entry.days}: ${entry.hours}`);
  if (content.hoursNote) hours.push(content.hoursNote);

  const services = content.services.map((service) =>
    service.price
      ? `${service.name}: ${service.summary} Price: ${service.price}.`
      : `${service.name}: ${service.summary}`,
  );

  const booking = [`Book at: ${content.bookingUrl}`];
  if (content.pricingNote) booking.push(`Pricing: ${content.pricingNote}`);

  return [
    { heading: "Business", lines: business },
    { heading: "Hours", lines: hours },
    { heading: "Services and published prices", lines: services },
    { heading: "Service area", lines: content.serviceArea ? [content.serviceArea] : [] },
    { heading: "How to book", lines: booking },
    {
      heading: "Team",
      lines: (content.team ?? []).map((member) => `${member.name}: ${member.role}`),
    },
    {
      heading: "Policies",
      lines: content.policies.map((policy) => `${policy.title}: ${policy.text}`),
    },
    {
      heading: "Frequently asked questions",
      lines: content.faqs.flatMap((faq) => [`Q: ${faq.question}`, `A: ${faq.answer}`]),
    },
    { heading: "Other pages", lines: content.pages.map((page) => `${page.title}: ${page.url}`) },
  ];
}

/**
 * The full system prompt: the rules, then the business facts. Pure and
 * deterministic, so the same inputs always give the same text.
 */
export function buildSystemPrompt(content: BusinessContent, config: ChatConfig): string {
  const blocks = [buildRules(content, config)];
  for (const { heading, lines } of sections(content)) {
    if (lines.length === 0) continue;
    blocks.push([`## ${heading}`, ...lines.map((line) => `- ${line}`)].join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}
