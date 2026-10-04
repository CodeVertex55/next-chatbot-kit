import { describe, expect, it } from "vitest";
import { validateLead } from "@/chat/lead";

const valid = {
  name: "Maya Ortega",
  phone: "555 0142",
  email: "maya@example.com",
  page: "/treatments",
};

function errorsOf(value: unknown): Record<string, string> {
  const result = validateLead(value);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateLead success", () => {
  it("returns the trimmed fields", () => {
    const result = validateLead({
      name: "  Maya Ortega ",
      phone: " 555 0142 ",
      email: " maya@example.com ",
      page: " /treatments ",
    });
    expect(result).toEqual({
      ok: true,
      honeypot: false,
      lead: {
        name: "Maya Ortega",
        phone: "555 0142",
        email: "maya@example.com",
        page: "/treatments",
      },
    });
  });

  it("leaves the page out when it is missing or blank", () => {
    for (const page of [undefined, null, "", "   "]) {
      const result = validateLead({ ...valid, page });
      expect(result.ok).toBe(true);
      if (result.ok) expect("page" in result.lead).toBe(false);
    }
  });

  it("accepts a leading plus and common separators in the phone number", () => {
    for (const phone of ["+61 (2) 5550-0142", "(555) 014.2", "+15550142"]) {
      expect(validateLead({ ...valid, phone }).ok).toBe(true);
    }
  });

  it("accepts a page of exactly 300 characters", () => {
    const page = "/" + "a".repeat(299);
    expect(validateLead({ ...valid, page }).ok).toBe(true);
  });
});

describe("validateLead name", () => {
  it("rejects a missing, short or long name", () => {
    expect(errorsOf({ ...valid, name: undefined }).name).toBe("Enter your name.");
    expect(errorsOf({ ...valid, name: 42 }).name).toBe("Enter your name.");
    expect(errorsOf({ ...valid, name: "A" }).name).toBe("Enter your name.");
    expect(errorsOf({ ...valid, name: "   " }).name).toBe("Enter your name.");
    expect(errorsOf({ ...valid, name: "a".repeat(81) }).name).toBe("Enter your name.");
  });

  it("accepts the length limits", () => {
    expect(validateLead({ ...valid, name: "Al" }).ok).toBe(true);
    expect(validateLead({ ...valid, name: "a".repeat(80) }).ok).toBe(true);
  });
});

describe("validateLead phone", () => {
  it("rejects bad phone numbers", () => {
    const bad = [
      undefined,
      12345678,
      "",
      "123456",
      "1".repeat(21),
      "555-abc-0142",
      "555 0142 ext 3",
      "++5550142",
      "555+0142",
      "(((((((",
      "-------",
    ];
    for (const phone of bad) {
      expect(errorsOf({ ...valid, phone }).phone).toBe("Enter a valid phone number.");
    }
  });

  it("counts length after spaces are removed", () => {
    expect(validateLead({ ...valid, phone: "1 2 3 4 5 6 7" }).ok).toBe(true);
    expect(validateLead({ ...valid, phone: "1".repeat(20) }).ok).toBe(true);
    expect(validateLead({ ...valid, phone: "1 ".repeat(20).trim() }).ok).toBe(true);
  });
});

describe("validateLead email", () => {
  it("rejects bad email addresses", () => {
    const bad = [
      undefined,
      7,
      "",
      "maya",
      "maya@",
      "@example.com",
      "maya@example",
      "maya@.example.com",
      "maya@example.com.",
      "maya@@example.com",
      "a@b@example.com",
      "ma ya@example.com",
      "maya@exa mple.com",
      `${"a".repeat(250)}@b.co`,
    ];
    for (const email of bad) {
      expect(errorsOf({ ...valid, email }).email).toBe("Enter a valid email address.");
    }
  });

  it("accepts an address of exactly 254 characters", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(186)}.co`;
    expect(email).toHaveLength(254);
    expect(validateLead({ ...valid, email }).ok).toBe(true);
  });

  it("validates long hostile input quickly", () => {
    const inputs = [
      "a@".repeat(100000),
      "@.".repeat(127),
      `${"a.".repeat(126)}@`,
      "@".repeat(5000),
      `${"a".repeat(100000)}?`,
    ];
    const start = performance.now();
    for (const email of inputs) {
      expect(errorsOf({ ...valid, email }).email).toBe("Enter a valid email address.");
    }
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("validateLead page", () => {
  it("rejects a page over 300 characters", () => {
    expect(errorsOf({ ...valid, page: "/" + "a".repeat(300) }).page).toBe("Page is too long.");
  });

  it("rejects a page that is not text", () => {
    expect(errorsOf({ ...valid, page: 5 }).page).toBeDefined();
    expect(errorsOf({ ...valid, page: { path: "/" } }).page).toBeDefined();
  });
});

describe("validateLead control characters", () => {
  const control = [
    String.fromCharCode(0),
    String.fromCharCode(9),
    String.fromCharCode(10),
    String.fromCharCode(13),
    String.fromCharCode(27),
    String.fromCharCode(127),
  ];

  it("rejects control characters inside any field", () => {
    for (const c of control) {
      expect(errorsOf({ ...valid, name: `Ma${c}ya` }).name).toBeDefined();
      expect(errorsOf({ ...valid, phone: `555${c}0142` }).phone).toBeDefined();
      expect(errorsOf({ ...valid, email: `ma${c}ya@example.com` }).email).toBeDefined();
      expect(errorsOf({ ...valid, page: `/a${c}b` }).page).toBeDefined();
    }
  });

  it("rejects a header injection attempt in the name", () => {
    const name = "Eve\r\nBcc: someone@example.org";
    expect(errorsOf({ ...valid, name }).name).toBe("Enter your name.");
  });
});

describe("validateLead shape and honeypot", () => {
  it("rejects values that are not objects", () => {
    for (const value of [null, undefined, "text", 5, true, []]) {
      const errors = errorsOf(value);
      expect(errors.name).toBeDefined();
      expect(errors.phone).toBeDefined();
      expect(errors.email).toBeDefined();
    }
  });

  it("reports every failing field at once", () => {
    expect(errorsOf({ name: "", phone: "1", email: "x", page: "/" + "a".repeat(400) })).toEqual({
      name: "Enter your name.",
      phone: "Enter a valid phone number.",
      email: "Enter a valid email address.",
      page: "Page is too long.",
    });
  });

  it("flags the honeypot when company has text", () => {
    const result = validateLead({ ...valid, company: "Acme" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.honeypot).toBe(true);
  });

  it("still returns ok for a honeypot hit with invalid fields", () => {
    const result = validateLead({ name: "", phone: "x", email: "y", company: "Acme" });
    expect(result).toEqual({
      ok: true,
      honeypot: true,
      lead: { name: "", phone: "", email: "" },
    });
  });

  it("does not flag an empty or blank company", () => {
    for (const company of ["", "   ", undefined, null, 0]) {
      const result = validateLead({ ...valid, company });
      expect(result.ok && result.honeypot).toBe(false);
    }
  });
});
