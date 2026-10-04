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

  describe("line breaks", () => {
    const paragraphs = "Open Monday to Friday, 9 to 5.\n\u2014 Saturday: closed\n\nCall us \u2014.";
    const expected = "Open Monday to Friday, 9 to 5.\nSaturday: closed\n\nCall us.";

    it("keeps line breaks and drops a dash at a line start or before punctuation", () => {
      expect(run([paragraphs])).toBe(expected);
    });

    it("gives the same output for the multi-paragraph text at every split", () => {
      for (let index = 0; index <= paragraphs.length; index += 1) {
        expect(runSplit(paragraphs, index)).toBe(expected);
      }
      expect(run([...paragraphs])).toBe(expected);
    });

    it("never swallows a newline next to a dash", () => {
      expect(run(["one \u2014\ntwo"])).toBe("one\ntwo");
      expect(run(["one\n\u2014 two"])).toBe("one\ntwo");
      expect(run(["one \n \u2014 \n two"])).toBe("one \n\n two");
      expect(run(["one\r\n\u2014 two"])).toBe("one\r\ntwo");
    });

    it("drops the dash and the space before it ahead of punctuation", () => {
      for (const mark of [".", ",", ";", ":", "!", "?"]) {
        expect(run([`us \u2014${mark}`])).toBe(`us${mark}`);
        expect(run([`us \u2014 ${mark}`])).toBe(`us${mark}`);
      }
    });

    it("keeps a space when the dash follows punctuation and text comes next", () => {
      expect(run(["Done. \u2014 Next"])).toBe("Done. Next");
      expect(run(["Done.\u2014Next"])).toBe("Done.Next");
    });

    it("still joins ordinary text on one line with a comma", () => {
      expect(run(["a \u2014 b"])).toBe("a, b");
      expect(run(["a\u2014b"])).toBe("a, b");
      expect(run(["9\u20135"])).toBe("9-5");
      for (let index = 0; index <= 7; index += 1) {
        expect(runSplit("a \u2014 b", index)).toBe("a, b");
        expect(runSplit("9\u20135", index)).toBe("9-5");
      }
    });

    it("drops a dash at the start of the reply or the end of a line", () => {
      expect(run(["\u2014\u2014 hello"])).toBe("hello");
      expect(run(["hello \u2014\n\nworld"])).toBe("hello\n\nworld");
    });
  });

  it("resets after flush", () => {
    const filter = createPunctuationFilter();
    filter.push("a \u2014");
    filter.flush();
    expect(filter.push("\u2014 b")).toBe("b");
  });
});
