import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(import.meta.dirname, "../../src/chat/widget/chat.module.css"),
  "utf8",
);

describe("widget styles", () => {
  it("sets text inputs and the textarea to 16px so phones do not zoom on focus", () => {
    const rule = /\.root input,\s*\.root textarea\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toMatch(/font-size:\s*16px/);
  });
});
