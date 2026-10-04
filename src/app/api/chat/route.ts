import { createChatHandler } from "@/chat";
import { business } from "@/content/business";
import { chatConfig } from "@/chat.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createChatHandler({ content: business, config: chatConfig });
