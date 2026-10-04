import { createLeadHandler } from "@/chat";
import { business } from "@/content/business";
import { chatConfig } from "@/chat.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createLeadHandler({ content: business, config: chatConfig });
