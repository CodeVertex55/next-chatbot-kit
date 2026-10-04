import { describe, expect, it } from "vitest";
import { escapeHtml, renderCallbackEmail } from "@/chat/email/template";
import type { Lead } from "@/chat/notify/types";

const options = {
  businessName: "Test Loaf Bakery",
  siteUrl: "https://testloaf.example",
  accent: "#0f766e",
};

const lead: Lead = {
  name: "Maya Ortega",
  phone: "+61 (2) 5550-0142",
  email: "maya@example.com",
  page: "/menu",
  receivedAt: "2026-10-04T09:30:00.000Z",
};

function render(overrides: Partial<Lead> = {}, extra: Partial<typeof options> = {}) {
  return renderCallbackEmail({ ...lead, ...overrides }, { ...options, ...extra });
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

describe("escapeHtml", () => {
  it("escapes the five special characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });

  it("escapes the ampersand first so entities are not doubled", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Maya Ortega")).toBe("Maya Ortega");
  });
});

describe("renderCallbackEmail subject and heading", () => {
  it("uses the first name", () => {
    const email = render();
    expect(email.subject).toBe("Call back Maya");
    expect(email.html).toContain("Call back Maya");
    expect(email.text).toContain("Call back Maya");
  });

  it("treats any whitespace as the separator", () => {
    expect(render({ name: "  Anna\tMaria  Lopez" }).subject).toBe("Call back Anna");
  });

  it("strips line breaks from the subject", () => {
    const email = render({ name: "Eve\r\nBcc: evil@example.org" });
    expect(email.subject).toBe("Call back Eve");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("strips line breaks that sit inside the first name", () => {
    const email = render({ name: "Eve\r\nBcc:evil" });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("caps the subject at 120 characters", () => {
    expect(render({ name: "a".repeat(500) }).subject).toHaveLength(120);
  });
});

describe("renderCallbackEmail escaping", () => {
  const hostile = {
    name: `<script>alert(1)</script> "Bob"`,
    email: `"><img src=x onerror=alert(1)>@example.com`,
    page: `/x"><script>alert(2)</script>`,
    phone: `555"><b>0142`,
    receivedAt: `<i>now</i>`,
  };

  it("escapes every visitor value in the html", () => {
    const { html } = render(hostile, { businessName: "Loaf <b>& Co</b>" });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Loaf &lt;b&gt;&amp; Co&lt;/b&gt;");
  });

  it("keeps attribute values closed", () => {
    const { html } = render(hostile);
    for (const href of hrefs(html)) {
      expect(href).not.toContain('"');
      expect(href).not.toContain("<");
      expect(href).not.toContain(">");
    }
  });

  it("does not echo line breaks into the html or text as new headers", () => {
    const email = render({ name: "Eve\r\nBcc: evil@example.org" });
    expect(email.html).toContain("Call back Eve");
    expect(email.subject).not.toContain("Bcc");
  });
});

describe("renderCallbackEmail phone and buttons", () => {
  it("builds tel and sms links from digits and a leading plus only", () => {
    const { html } = render();
    const links = hrefs(html);
    expect(links).toContain("tel:+61255500142");
    expect(links).toContain("sms:+61255500142");
  });

  it("drops the plus when the number has none", () => {
    const { html } = render({ phone: "(555) 014-2000" });
    expect(hrefs(html)).toContain("tel:5550142000");
  });

  it("never lets anything but digits and a plus into a phone href", () => {
    const { html } = render({ phone: `555"><script>alert(1)</script>0142` });
    const phoneLinks = hrefs(html).filter((h) => h.startsWith("tel:") || h.startsWith("sms:"));
    expect(phoneLinks.length).toBeGreaterThan(0);
    for (const link of phoneLinks) expect(link).toMatch(/^(tel|sms):\+?[0-9]*$/);
  });

  it("shows the phone number as a large link and adds three buttons", () => {
    const { html } = render();
    expect(html).toMatch(/font-size:\s*2[4-9]px|font-size:\s*[3-9][0-9]px/);
    expect(html).toContain(">Call<");
    expect(html).toContain(">Text<");
    expect(html).toContain(">Email<");
    expect(html).toContain("+61 (2) 5550-0142");
  });

  it("builds a mailto link that keeps the at sign", () => {
    const { html } = render({ email: "maya+loaf@example.com" });
    expect(hrefs(html)).toContain("mailto:maya%2Bloaf@example.com");
  });

  it("encodes unsafe characters in the mailto link", () => {
    const { html } = render({ email: "a b&c@example.com" });
    expect(hrefs(html)).toContain("mailto:a%20b%26c@example.com");
  });
});

describe("renderCallbackEmail page link", () => {
  function pageHref(page: string): string | undefined {
    const links = hrefs(render({ page }).html).filter((h) => !/^(tel|sms|mailto):/.test(h));
    return links[0];
  }

  it("links a same-site path on the site url", () => {
    expect(pageHref("/menu")).toBe("https://testloaf.example/menu");
  });

  it("links a same-site absolute url", () => {
    expect(pageHref("https://testloaf.example/menu?x=1")).toBe("https://testloaf.example/menu?x=1");
  });

  it("does not link a foreign url", () => {
    expect(pageHref("https://evil.example/menu")).toBeUndefined();
    expect(render({ page: "https://evil.example/menu" }).html).toContain(
      "https://evil.example/menu",
    );
  });

  it("does not link a javascript url", () => {
    expect(pageHref("javascript:alert(1)")).toBeUndefined();
    expect(render({ page: "javascript:alert(1)" }).html).toContain("javascript:alert(1)");
  });

  it("does not link a protocol-relative or backslash host", () => {
    expect(pageHref("//evil.example/menu")).toBeUndefined();
    expect(pageHref("/\\evil.example/menu")).toBeUndefined();
  });

  it("does not link a bare word that would resolve against the site", () => {
    expect(pageHref("menu")).toBeUndefined();
    expect(pageHref("testloaf.example/menu")).toBeUndefined();
  });

  it("does not link a different scheme on the same host", () => {
    expect(pageHref("http://testloaf.example/menu")).toBeUndefined();
  });

  it("leaves the link off when the site url is not a url", () => {
    const { html } = render({ page: "/menu" }, { siteUrl: "not a url" });
    expect(hrefs(html).filter((h) => h.includes("menu"))).toEqual([]);
    expect(html).toContain("/menu");
  });

  it("omits the page row when there is no page", () => {
    const withoutPage: Lead = { ...lead };
    delete withoutPage.page;
    const email = renderCallbackEmail(withoutPage, options);
    expect(email.html).not.toContain("Page");
    expect(email.text).not.toContain("Page");
  });
});

describe("renderCallbackEmail body", () => {
  it("lists name, email, page, time and the footer", () => {
    const { html, text } = render();
    for (const part of [
      "Maya Ortega",
      "maya@example.com",
      "/menu",
      "2026-10-04T09:30:00.000Z",
      "Sent from the chat on Test Loaf Bakery",
    ]) {
      expect(html).toContain(part);
      expect(text).toContain(part);
    }
  });

  it("uses a table layout with inline styles and the accent colour", () => {
    const { html } = render();
    expect(html).toContain("<table");
    expect(html).toContain('style="');
    expect(html).toContain("#0f766e");
    expect(html).not.toContain("<style");
  });

  it("ignores an accent that is not a hex colour", () => {
    const { html } = render({}, { accent: 'red;" onload="alert(1)' });
    expect(html).not.toContain("onload");
    expect(html).not.toContain("red;");
  });

  it("gives the text body the phone number and the facts as plain lines", () => {
    const { text } = render();
    const lines = text.split("\n");
    expect(lines).toContain("Phone: +61 (2) 5550-0142");
    expect(lines).toContain("Name: Maya Ortega");
    expect(lines).toContain("Email: maya@example.com");
    expect(lines).toContain("Page: /menu");
    expect(lines).toContain("Time: 2026-10-04T09:30:00.000Z");
    expect(text).not.toContain("<");
  });
});
