// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { linkify } from "@/chat/widget/linkify";

afterEach(cleanup);

const options = { siteHost: "example.test", phone: "555-0142", phoneHref: "tel:+15550142" };

function show(text: string) {
  return render(<p>{linkify(text, options)}</p>);
}

describe("linkify", () => {
  it("returns plain text unchanged", () => {
    const { container } = show("Hello there");
    expect(container.textContent).toBe("Hello there");
    expect(container.querySelector("a")).toBeNull();
  });

  it("links an https URL on the own host, with the URL as the text", () => {
    const { container } = show("See https://example.test/book for details");
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.test/book");
    expect(link).toHaveTextContent("https://example.test/book");
    expect(container.textContent).toBe("See https://example.test/book for details");
  });

  it("links a bare own host URL", () => {
    const { container } = show("Go to https://example.test now");
    expect(container.querySelector("a")).toHaveAttribute("href", "https://example.test");
  });

  it("leaves a foreign URL as plain text", () => {
    const { container } = show("Try https://other.test/page today");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Try https://other.test/page today");
  });

  it("does not link look-alike hosts", () => {
    for (const url of [
      "https://example.test.evil.test/x",
      "https://example.test@evil.test/x",
      "https://example.test:8443/x",
      "https://sub.example.test/x",
    ]) {
      const { container, unmount } = show(`Open ${url} please`);
      expect(container.querySelector("a")).toBeNull();
      unmount();
    }
  });

  it("does not link http on the own host", () => {
    const { container } = show("Old link http://example.test/book here");
    expect(container.querySelector("a")).toBeNull();
  });

  it("excludes trailing punctuation from the link", () => {
    for (const [text, href] of [
      ["Visit https://example.test/book.", "https://example.test/book"],
      ["Visit https://example.test/book, then call", "https://example.test/book"],
      ["(see https://example.test/book)", "https://example.test/book"],
      ["Visit https://example.test/book).", "https://example.test/book"],
    ] as const) {
      const { container, unmount } = show(text);
      expect(container.querySelector("a")).toHaveAttribute("href", href);
      expect(container.textContent).toBe(text);
      unmount();
    }
  });

  it("links the phone number to the phone href", () => {
    const { container } = show("Call 555-0142 any time");
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "tel:+15550142");
    expect(link).toHaveTextContent("555-0142");
    expect(container.textContent).toBe("Call 555-0142 any time");
  });

  it("links several matches in order", () => {
    const text = "Book at https://example.test/book or call 555-0142, or 555-0142 again.";
    const { container } = show(text);
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.test/book",
      "tel:+15550142",
      "tel:+15550142",
    ]);
    expect(container.textContent).toBe(text);
  });

  it("keeps markup from the model as text", () => {
    const text = 'Hi <img src=x onerror="alert(1)"> and <a href="https://evil.test">x</a>';
    const { container } = show(text);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe(text);
  });

  it("does not link javascript or data URLs", () => {
    const { container } = show("javascript:alert(1) data:text/html,hi");
    expect(container.querySelector("a")).toBeNull();
  });

  it("handles empty text and an empty phone", () => {
    expect(linkify("", options)).toEqual([]);
    const { container } = render(
      <p>{linkify("anything", { siteHost: "", phone: "", phoneHref: "" })}</p>,
    );
    expect(container.textContent).toBe("anything");
  });
});
