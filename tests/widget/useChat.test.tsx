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

function setup(maxMessageChars = 100) {
  return renderHook(() => useChat({ endpoint: "/api/chat", maxMessageChars }));
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
});
