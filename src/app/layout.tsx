import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatWidget } from "@/chat/widget";
import { toPublicConfig } from "@/chat";
import { chatConfig } from "@/chat.config";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { business } from "@/content/business";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: business.name, template: `%s | ${business.name}` },
  description: `${business.name} is ${business.description}. This is a demo site for next-chatbot-kit.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="site-main">
          {children}
        </main>
        <SiteFooter />
        <ChatWidget config={toPublicConfig(chatConfig, business)} />
      </body>
    </html>
  );
}
