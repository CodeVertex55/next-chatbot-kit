import type { Lead } from "../notify/types";

export interface EmailOptions {
  businessName: string;
  siteUrl: string;
  accent: string;
}

const MAX_SUBJECT = 120;
const FALLBACK_ACCENT = "#0f766e";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Digits and a leading plus only, so the value is safe inside a tel: or sms: link. */
function dialable(phone: string): string {
  const plus = phone.trim().startsWith("+") ? "+" : "";
  return plus + phone.replace(/[^0-9]/g, "");
}

function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;
}

/** The absolute on-site URL for a page value, or null when it points anywhere else. */
function sitePageHref(page: string, siteUrl: string): string | null {
  let site: URL;
  let target: URL;
  try {
    site = new URL(siteUrl);
    // Only a path or a full URL qualifies. A bare word would resolve against the site.
    target = page.startsWith("/") ? new URL(page, site) : new URL(page);
  } catch {
    return null;
  }
  if (target.origin !== site.origin) return null;
  return target.href;
}

function safeAccent(accent: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : FALLBACK_ACCENT;
}

function button(label: string, href: string, accent: string): string {
  return (
    `<td style="padding:0 8px 0 0;">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;` +
    `background:${accent};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;` +
    `text-decoration:none;border-radius:8px;">${label}</a></td>`
  );
}

function row(label: string, valueHtml: string): string {
  return (
    `<tr><td style="padding:8px 16px 8px 0;font-family:${FONT};font-size:14px;color:#6b7280;` +
    `vertical-align:top;white-space:nowrap;">${label}</td>` +
    `<td style="padding:8px 0;font-family:${FONT};font-size:15px;color:#111827;` +
    `word-break:break-word;">${valueHtml}</td></tr>`
  );
}

export function renderCallbackEmail(
  lead: Lead,
  options: EmailOptions,
): { subject: string; html: string; text: string } {
  const firstName = firstNameOf(lead.name);
  const subject = `Call back ${firstName}`.replace(/[\r\n]/g, "").slice(0, MAX_SUBJECT);
  const accent = safeAccent(options.accent);
  const dial = dialable(lead.phone);

  const rows = [
    row("Name", escapeHtml(lead.name)),
    row(
      "Email",
      `<a href="${escapeHtml(mailtoHref(lead.email))}" style="color:${accent};">${escapeHtml(lead.email)}</a>`,
    ),
  ];
  if (lead.page !== undefined) {
    const pageHref = sitePageHref(lead.page, options.siteUrl);
    rows.push(
      row(
        "Page",
        pageHref === null
          ? escapeHtml(lead.page)
          : `<a href="${escapeHtml(pageHref)}" style="color:${accent};">${escapeHtml(lead.page)}</a>`,
      ),
    );
  }
  rows.push(row("Time", escapeHtml(lead.receivedAt)));

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="max-width:520px;background:#ffffff;border-radius:12px;">` +
    `<tr><td style="padding:28px 28px 8px 28px;">` +
    `<h1 style="margin:0;font-family:${FONT};font-size:22px;color:#111827;">` +
    `Call back ${escapeHtml(firstName)}</h1></td></tr>` +
    `<tr><td style="padding:8px 28px 16px 28px;">` +
    `<a href="tel:${dial}" style="font-family:${FONT};font-size:28px;font-weight:700;` +
    `color:${accent};text-decoration:none;">${escapeHtml(lead.phone)}</a></td></tr>` +
    `<tr><td style="padding:0 28px 20px 28px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    button("Call", `tel:${dial}`, accent) +
    button("Text", `sms:${dial}`, accent) +
    button("Email", mailtoHref(lead.email), accent) +
    `</tr></table></td></tr>` +
    `<tr><td style="padding:0 28px 8px 28px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-top:1px solid #e5e7eb;">${rows.join("")}</table></td></tr>` +
    `<tr><td style="padding:16px 28px 24px 28px;font-family:${FONT};font-size:12px;color:#6b7280;">` +
    `Sent from the chat on ${escapeHtml(options.businessName)}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [
    `Call back ${firstName}`,
    "",
    `Phone: ${lead.phone}`,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    ...(lead.page === undefined ? [] : [`Page: ${lead.page}`]),
    `Time: ${lead.receivedAt}`,
    "",
    `Sent from the chat on ${options.businessName}`,
  ].join("\n");

  return { subject, html, text };
}
