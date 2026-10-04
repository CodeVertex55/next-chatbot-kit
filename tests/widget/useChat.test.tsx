// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/chat/widget/useChat";
import { KEYS } from "@/chat/widget/storage";
import { controlledResponse, fakeResponse, jsonResponse, textResponse } from "./helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function setup(maxMessageChars = 100, maxTurns?: number) {
  return renderHook(() =>
    useChat({
      endpoint: "/api/chat",
      maxMessageChars,
      ...(maxTurns === undefined ? {} : { maxTurns }),
    }),
  );
}

function sentBody(call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as { messages: { role: string; content: string }[] };
}

describe("useChat", () => {
  it("starts idle and empty", () => {
    const { result } = setup();
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("grows the reply chunk by chunk and returns to idle", async () => {
    const feed = controlledResponse();
    fetchMock.mockResolvedValue(feed.response);
    const { result } = setup();

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.send("  Hello there  ");
    });
    expect(result.current.status).toBe("streaming");
    expect(result.current.messages).toEqual([
      { role: "user", content: "Hello there" },
      { role: "assistant", content: "" },
    ]);

    await act(async () => {
      feed.push("Hel");
    });
    expect(result.current.messages[1]?.content).toBe("Hel");

    await act(async () => {
      feed.push("lo");
      feed.close();
      await done;
    });
    expect(result.current.messages[1]?.content).toBe("Hello");
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("posts the history without the empty placeholder", async () => {
    fetchMock.mockImplementation(async () => textResponse(["Reply"]));
    const { result } = setup();

    await act(() => result.current.send("First"));
    await act(() => result.current.send("Second"));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(sentBody(0).messages).toEqual([{ role: "user", content: "First" }]);
    expect(sentBody(1).messages).toEqual([
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply" },
      { role: "user", content: "Second" },
    ]);
  });

  it("ignores empty input and input while streaming", async () => {
    const feed = controlledResponse();
    fetchMock.mockResolvedValue(feed.response);
    const { result } = setup();

    await act(() => result.current.send("   "));
    expect(fetchMock).not.toHaveBeenCalled();

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.send("One");
    });
    await act(() => result.current.send("Two"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(2);

    await act(async () => {
      feed.close();
      await done;
    });
  });

  it("caps the message to maxMessageChars", async () => {
    fetchMock.mockResolvedValue(textResponse(["ok"]));
    const { result } = setup(5);
    await act(() => result.current.send("abcdefghij"));
    expect(sentBody().messages[0]?.content).toBe("abcde");
  });

  describe("long conversations", () => {
    function seed(pairs: number, assistantText: string, userText = "question") {
      const saved: { role: string; content: string }[] = [];
      for (let i = 0; i < pairs; i += 1) {
        saved.push({ role: "user", content: `${userText} ${i}` });
        saved.push({ role: "assistant", content: `${assistantText} ${i}` });
      }
      sessionStorage.setItem(KEYS.conversation, JSON.stringify(saved));
      return saved;
    }

    it("sends only the last 2 * maxTurns - 1 messages, ending with the new question", async () => {
      fetchMock.mockResolvedValue(textResponse(["ok"]));
      seed(3, "answer");
      const { result } = setup(100, 2);
      await act(() => result.current.send("newest"));
      expect(sentBody().messages).toEqual([
        { role: "user", content: "question 2" },
        { role: "assistant", content: "answer 2" },
        { role: "user", content: "newest" },
      ]);
    });

    it("keeps the whole visible transcript when it trims what it sends", async () => {
      fetchMock.mockResolvedValue(textResponse(["ok"]));
      seed(3, "answer");
      const { result } = setup(100, 2);
      await act(() => result.current.send("newest"));
      expect(result.current.messages).toHaveLength(8);
      expect(result.current.messages[0]?.content).toBe("question 0");
    });

    it("sends everything when the history is within the turn limit", async () => {
      fetchMock.mockResolvedValue(textResponse(["ok"]));
      seed(1, "answer");
      const { result } = setup(100, 2);
      await act(() => result.current.send("newest"));
      expect(sentBody().messages).toHaveLength(3);
    });

    it("starts the trimmed history on a user turn", async () => {
      fetchMock.mockResolvedValue(textResponse(["ok"]));
      seed(4, "answer");
      const { result } = setup(100, 3);
      await act(() => result.current.send("newest"));
      const sent = sentBody().messages;
      expect(sent).toHaveLength(5);
      expect(sent[0]?.role).toBe("user");
      expect(sent.at(-1)).toEqual({ role: "user", content: "newest" });
      sent.forEach((message, index) => {
        expect(message.role).toBe(index % 2 === 0 ? "user" : "assistant");
      });
    });

    it("defaults to the server default of 16 turns", async () => {
      fetchMock.mockResolvedValue(textResponse(["ok"]));
      seed(20, "a");
      const { result } = setup();
      await act(() => result.current.send("newest"));
      expect(sentBody().messages).toHaveLength(31);
    });

    it("drops the oldest pairs until the body is within 60000 bytes", async () => {
      fetchMock.mockResolvedValue(textResponse(["ok"]));
      const saved = seed(15, "\u00e9".repeat(3900), "q".repeat(1400));
      const { result } = setup(1500, 40);
      await act(() => result.current.send("newest"));

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const bytes = new TextEncoder().encode(init.body as string).length;
      expect(bytes).toBeLessThanOrEqual(60000);

      const sent = sentBody().messages;
      expect(sent.length).toBeLessThan(31);
      expect(sent[0]?.role).toBe("user");
      expect(sent.at(-1)).toEqual({ role: "user", content: "newest" });
      expect(sent.length % 2).toBe(1);
      // What remains is the newest part of the conversation, unchanged.
      const dropped = 30 - (sent.length - 1);
      expect(sent[0]?.content).toBe(saved[dropped]?.content);
      // One pair fewer dropped would not have fitted.
      const oneMorePair = [...saved.slice(dropped - 2), { role: "user", content: "newest" }];
      expect(
        new TextEncoder().encode(JSON.stringify({ messages: oneMorePair })).length,
      ).toBeGreaterThan(60000);
    });
  });

  it("sets rate-limited on 429 and removes the placeholder", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: "slow down" }));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("rate-limited");
    expect(result.current.status).toBe("idle");
    expect(result.current.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("sets network on another non-2xx status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("network");
    expect(result.current.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("sets network when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("network");
    expect(result.current.status).toBe("idle");
    expect(result.current.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("sets network when a successful response has no body", async () => {
    fetchMock.mockResolvedValue(fakeResponse({}));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("network");
    expect(result.current.messages).toHaveLength(1);
  });

  it("clears the error on the next send", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    fetchMock.mockResolvedValueOnce(textResponse(["Fine"]));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("network");
    await act(() => result.current.send("Again"));
    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)?.content).toBe("Fine");
    expect(sentBody(1).messages).toEqual([{ role: "user", content: "Again" }]);
  });

  it("keeps the partial text when the stream fails part way", async () => {
    const feed = controlledResponse();
    fetchMock.mockResolvedValue(feed.response);
    const { result } = setup();
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.send("Hi");
    });
    await act(async () => {
      feed.push("Part");
    });
    await act(async () => {
      feed.fail(new TypeError("connection lost"));
      await done;
    });
    expect(result.current.error).toBe("network");
    expect(result.current.status).toBe("idle");
    expect(result.current.messages[1]?.content).toBe("Part");
  });

  it("stop aborts and keeps the partial reply", async () => {
    const feed = controlledResponse();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      init.signal?.addEventListener("abort", () => feed.close());
      return Promise.resolve(feed.response);
    });
    const { result } = setup();

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.send("Hi");
    });
    await act(async () => {
      feed.push("Partial");
    });
    await act(async () => {
      result.current.stop();
      await done;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Partial" },
    ]);
  });

  it("stop with no text yet removes the empty placeholder", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const { result } = setup();
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.send("Hi");
    });
    await act(async () => {
      result.current.stop();
      await done;
    });
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("aborts the request on unmount", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise(() => {});
    });
    const { result, unmount } = setup();
    await act(async () => {
      void result.current.send("Hi");
    });
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("saves the conversation when a reply completes", async () => {
    fetchMock.mockResolvedValue(textResponse(["Saved reply"]));
    const { result } = setup();
    await act(() => result.current.send("Question"));
    expect(JSON.parse(sessionStorage.getItem(KEYS.conversation) ?? "null")).toEqual([
      { role: "user", content: "Question" },
      { role: "assistant", content: "Saved reply" },
    ]);
  });

  it("restores the conversation from sessionStorage", () => {
    const saved = [
      { role: "user", content: "Earlier" },
      { role: "assistant", content: "Answer" },
    ];
    sessionStorage.setItem(KEYS.conversation, JSON.stringify(saved));
    const { result } = setup();
    expect(result.current.messages).toEqual(saved);
    expect(result.current.status).toBe("idle");
  });

  it("ignores invalid stored conversations", () => {
    for (const value of [
      "not json",
      '{"a":1}',
      '[{"role":"system","content":"x"}]',
      '[{"role":"user","content":5}]',
      "null",
    ]) {
      sessionStorage.setItem(KEYS.conversation, value);
      const { result, unmount } = setup();
      expect(result.current.messages).toEqual([]);
      unmount();
    }
  });

  it("sends only alternating turns after an unanswered message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    fetchMock.mockResolvedValueOnce(textResponse(["Ok"]));
    const { result } = setup();
    await act(() => result.current.send("Lost"));
    await act(() => result.current.send("Retry"));
    expect(sentBody(1).messages).toEqual([{ role: "user", content: "Retry" }]);
  });

  it("caps assistant turns in the posted history at the server limit", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(["x".repeat(5000)]));
    fetchMock.mockResolvedValueOnce(textResponse(["Short"]));
    const { result } = setup(100);
    await act(() => result.current.send("First"));
    expect(result.current.messages[1]?.content).toHaveLength(5000);
    await act(() => result.current.send("Second"));

    const posted = sentBody(1).messages;
    expect(posted).toHaveLength(3);
    posted.forEach((message, index) => {
      expect(message.role).toBe(index % 2 === 0 ? "user" : "assistant");
      expect(message.content.length).toBeLessThanOrEqual(message.role === "user" ? 100 : 4000);
    });
    expect(posted[1]?.content).toHaveLength(4000);
  });

  it("caps a long reply that was restored from sessionStorage", async () => {
    sessionStorage.setItem(
      KEYS.conversation,
      JSON.stringify([
        { role: "user", content: "Earlier" },
        { role: "assistant", content: "y".repeat(6000) },
      ]),
    );
    fetchMock.mockResolvedValue(textResponse(["Ok"]));
    const { result } = setup();
    await act(() => result.current.send("Next"));
    expect(sentBody().messages[1]?.content).toHaveLength(4000);
  });

  it("ignores a stored conversation that starts with an assistant message", () => {
    sessionStorage.setItem(
      KEYS.conversation,
      JSON.stringify([
        { role: "assistant", content: "a" },
        { role: "user", content: "b" },
      ]),
    );
    const { result } = setup();
    expect(result.current.messages).toEqual([]);
  });

  it("ignores an empty stored conversation", () => {
    sessionStorage.setItem(KEYS.conversation, "[]");
    const { result } = setup();
    expect(result.current.messages).toEqual([]);
  });

  it("keeps a stored transcript that has consecutive user messages", () => {
    const saved = [
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "c" },
    ];
    sessionStorage.setItem(KEYS.conversation, JSON.stringify(saved));
    const { result } = setup();
    expect(result.current.messages).toEqual(saved);
  });

  it("restores the full transcript after a failed send that was retried", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    fetchMock.mockResolvedValueOnce(textResponse(["Answer"]));
    fetchMock.mockResolvedValueOnce(textResponse(["More"]));
    const first = setup();
    await act(() => first.result.current.send("Lost"));
    await act(() => first.result.current.send("Retry"));
    const transcript = [
      { role: "user", content: "Lost" },
      { role: "user", content: "Retry" },
      { role: "assistant", content: "Answer" },
    ];
    expect(first.result.current.messages).toEqual(transcript);
    first.unmount();

    const second = setup();
    expect(second.result.current.messages).toEqual(transcript);
    await act(() => second.result.current.send("Next"));
    expect(sentBody(2).messages).toEqual([
      { role: "user", content: "Retry" },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "Next" },
    ]);
  });

  it("treats a 200 response with no text as a network error", async () => {
    fetchMock.mockResolvedValue(textResponse([]));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("network");
    expect(result.current.status).toBe("idle");
    expect(result.current.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(sessionStorage.getItem(KEYS.conversation)).toBeNull();
  });

  it("treats a 200 response with only whitespace as a network error", async () => {
    fetchMock.mockResolvedValue(textResponse(["  ", " ", "   "]));
    const { result } = setup();
    await act(() => result.current.send("Hi"));
    expect(result.current.error).toBe("network");
    expect(result.current.messages).toEqual([{ role: "user", content: "Hi" }]);
  });
});
