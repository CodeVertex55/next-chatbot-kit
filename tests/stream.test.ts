import { describe, expect, it } from "vitest";
import { createPunctuationFilter } from "@/chat/stream";

function run(chunks: string[]): string {
  const filter = createPunctuationFilter();
  let out = "";
  for (const chunk of chunks) out += filter.push(chunk);
  return out + filter.flush();
}

function runSplit(text: string, index: number): string {
  return run([text.slice(0, index), text.slice(index)]);
}

describe("createPunctuationFilter", () => {
  it("turns a spaced em dash into a comma and a space", () => {
    expect(run(["a \u2014 b"])).toBe("a, b");
  });

  it("turns an en dash into a hyphen", () => {
    expect(run(["9\u20135"])).toBe("9-5");
  });

  it("gives the same output when split at every position", () => {
    const samples = [
      "a \u2014 b",
      "9\u20135",
      "a\u2014b",
      "ab  \u2014  cd \u2013 ef ",
      "x \u2014 \u2014 y",
    ];
    for (const text of samples) {
      const whole = run([text]);
      for (let index = 0; index <= text.length; index += 1) {
        expect(runSplit(text, index)).toBe(whole);
      }
    }
  });

  it("gives the same output one character at a time", () => {
    const text = "Open 9\u20135 \u2014 call us \u2014 any time";
    expect(run([...text])).toBe(run([text]));
    expect(run([text])).toBe("Open 9-5, call us, any time");
  });

  it("drops an em dash at the start", () => {
    expect(run(["\u2014 hello"])).toBe("hello");
    expect(run(["  \u2014hello"])).toBe("hello");
  });

  it("drops an em dash at the end", () => {
    const filter = createPunctuationFilter();
    expect(filter.push("hello \u2014")).toBe("hello");
    expect(filter.flush()).toBe("");
  });

  it("collapses consecutive em dashes", () => {
    expect(run(["a\u2014\u2014b"])).toBe("a, b");
    expect(run(["a \u2014 \u2014 b"])).toBe("a, b");
  });

  it("keeps trailing spaces for flush", () => {
    const filter = createPunctuationFilter();
    expect(filter.push("hello  ")).toBe("hello");
    expect(filter.flush()).toBe("  ");
  });

  it("leaves text without dashes unchanged", () => {
    const text = "Plain text, with commas.\nAnd a second line.";
    expect(run([text])).toBe(text);
    expect(run([...text])).toBe(text);
  });

  it("resets after flush", () => {
    const filter = createPunctuationFilter();
    filter.push("a \u2014");
    filter.flush();
    expect(filter.push("\u2014 b")).toBe("b");
  });
});
