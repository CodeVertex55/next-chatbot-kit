import type { BusinessContent } from "./content";

/** Sent when the assistant is switched off or has no key. */
export function holdingReply(content: BusinessContent): string {
  return `Thanks for your message. Our chat assistant is not available right now. Please call ${content.phone} or email ${content.email} and we will be glad to help.`;
}

/** Sent when the model returns nothing usable. */
export function fallbackReply(content: BusinessContent): string {
  return `Sorry, I could not answer that. Please call ${content.phone} or email ${content.email} and we will help.`;
}

/** Appended to a reply that was cut short by an error. */
export function interruptedSuffix(content: BusinessContent): string {
  return ` Sorry, something went wrong. Please call ${content.phone}.`;
}
