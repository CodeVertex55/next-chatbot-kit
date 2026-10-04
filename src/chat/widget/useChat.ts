"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../guard";
import { KEYS, readStored, writeStored } from "./storage";

export type ChatStatus = "idle" | "streaming";
export type ChatError = "rate-limited" | "network" | null;

export interface UseChatOptions {
  endpoint: string;
  maxMessageChars: number;
}

export interface UseChat {
  messages: ChatMessage[];
  status: ChatStatus;
  error: ChatError;
  send(text: string): Promise<void>;
  stop(): void;
}

/**
 * The longest assistant message the chat route accepts. Keep in step with
 * MAX_ASSISTANT_CHARS in the server guard. It is not imported, so no server code
 * reaches the client bundle.
 */
const MAX_ASSISTANT_CHARS = 4000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (role === "user" || role === "assistant") && typeof content === "string";
}

/** True when the turns start with a user message and the roles alternate. */
function alternates(messages: ChatMessage[]): boolean {
  return messages.every(
    (message, index) => message.role === (index % 2 === 0 ? "user" : "assistant"),
  );
}

/** The saved conversation, or an empty one when it is missing or invalid. */
function restore(): ChatMessage[] {
  const raw = readStored("session", KEYS.conversation);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isChatMessage) && alternates(parsed)) return parsed;
  } catch {
    // Invalid JSON is ignored.
  }
  return [];
}

/**
 * The turns to send: no empty replies, replies cut to the server limit, and when
 * a question never got an answer the newer question replaces it so the roles keep
 * alternating.
 */
function toHistory(messages: ChatMessage[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const message of messages) {
    if (message.content.trim() === "") continue;
    const turn =
      message.role === "assistant" && message.content.length > MAX_ASSISTANT_CHARS
        ? { ...message, content: message.content.slice(0, MAX_ASSISTANT_CHARS) }
        : message;
    const last = history[history.length - 1];
    if (last !== undefined && last.role === turn.role) history[history.length - 1] = turn;
    else history.push(turn);
  }
  return history;
}

export function useChat({ endpoint, maxMessageChars }: UseChatOptions): UseChat {
  const [messages, setMessages] = useState<ChatMessage[]>(restore);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<ChatError>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const commit = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const appendToReply = useCallback(
    (chunk: string) => {
      const next = [...messagesRef.current];
      const last = next[next.length - 1];
      if (last === undefined || last.role !== "assistant") return;
      next[next.length - 1] = { ...last, content: last.content + chunk };
      commit(next);
    },
    [commit],
  );

  const dropEmptyReply = useCallback(() => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last !== undefined && last.role === "assistant" && last.content.trim() === "") {
      commit(messagesRef.current.slice(0, -1));
    }
  }, [commit]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, maxMessageChars);
      if (content === "" || streamingRef.current) return;

      const history = toHistory([...messagesRef.current, { role: "user", content }]);
      commit([
        ...messagesRef.current,
        { role: "user", content },
        { role: "assistant", content: "" },
      ]);
      streamingRef.current = true;
      setStatus("streaming");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        if (response.status === 429) {
          setError("rate-limited");
          dropEmptyReply();
          return;
        }
        if (!response.ok || response.body === null) {
          setError("network");
          dropEmptyReply();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk !== "") appendToReply(chunk);
        }
        const rest = decoder.decode();
        if (rest !== "") appendToReply(rest);

        // A reply with no text is a failure, unless the visitor stopped it.
        const reply = messagesRef.current[messagesRef.current.length - 1];
        if (reply !== undefined && reply.content.trim() === "") {
          if (!controller.signal.aborted) setError("network");
          dropEmptyReply();
        }
      } catch {
        if (!controller.signal.aborted) setError("network");
        dropEmptyReply();
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = false;
        setStatus("idle");
        const last = messagesRef.current[messagesRef.current.length - 1];
        if (last !== undefined && last.role === "assistant" && last.content.trim() !== "") {
          writeStored("session", KEYS.conversation, JSON.stringify(messagesRef.current));
        }
      }
    },
    [endpoint, maxMessageChars, commit, appendToReply, dropEmptyReply],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, status, error, send, stop };
}
