import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { classifyModelError } from "@/chat/anthropic";

const headers = new Headers();

describe("classifyModelError", () => {
  it("names a request timeout, before its parent connection error", () => {
    const error = new Anthropic.APIConnectionTimeoutError();
    expect(error).toBeInstanceOf(Anthropic.APIConnectionError);
    expect(classifyModelError(error)).toEqual({ kind: "timeout", status: null });
  });

  it("names a connection error", () => {
    const error = new Anthropic.APIConnectionError({ message: "private detail" });
    expect(classifyModelError(error)).toEqual({ kind: "connection", status: null });
  });

  it("names an abort by the caller", () => {
    expect(classifyModelError(new Anthropic.APIUserAbortError())).toEqual({
      kind: "aborted",
      status: null,
    });
  });

  it("names an API error and gives its numeric status", () => {
    const rateLimited = Anthropic.APIError.generate(429, { error: {} }, "slow down", headers);
    expect(classifyModelError(rateLimited)).toEqual({ kind: "api", status: 429 });
    const overloaded = Anthropic.APIError.generate(529, { error: {} }, "busy", headers);
    expect(classifyModelError(overloaded)).toEqual({ kind: "api", status: 529 });
  });

  it("does not depend on the class name", () => {
    const error = Anthropic.APIError.generate(500, { error: {} }, "boom", headers);
    // Minified builds rename the classes. The result must not follow the name.
    Object.defineProperty(error.constructor, "name", { value: "d" });
    expect(classifyModelError(error)).toEqual({ kind: "api", status: 500 });
  });

  it("calls anything else other, with no status", () => {
    expect(classifyModelError(new Error("plain"))).toEqual({ kind: "other", status: null });
    expect(classifyModelError(new Anthropic.AnthropicError("sdk"))).toEqual({
      kind: "other",
      status: null,
    });
    expect(classifyModelError("text")).toEqual({ kind: "other", status: null });
    expect(classifyModelError(null)).toEqual({ kind: "other", status: null });
  });
});
