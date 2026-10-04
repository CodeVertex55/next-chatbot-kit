"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatStrings } from "../config";
import type { ChatMessage } from "../guard";
import styles from "./chat.module.css";
import { linkify } from "./linkify";
import type { LinkifyOptions } from "./linkify";
import type { ChatStatus } from "./useChat";

export interface MessageListProps {
  messages: ChatMessage[];
  status: ChatStatus;
  strings: ChatStrings;
  linkOptions: LinkifyOptions;
}

function lastReply(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1];
  return last !== undefined && last.role === "assistant" ? last.content : "";
}

export function MessageList({ messages, status, strings, linkOptions }: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [seenStatus, setSeenStatus] = useState(status);
  const [announcement, setAnnouncement] = useState("");

  // The live region gets the whole reply once, when streaming ends.
  if (seenStatus !== status) {
    setSeenStatus(status);
    setAnnouncement(seenStatus === "streaming" && status === "idle" ? lastReply(messages) : "");
  }

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  const waiting = status === "streaming" && lastReply(messages) === "" && messages.length > 0;
  const lastIndex = messages.length - 1;

  return (
    <div className={styles.messages} ref={scroller}>
      {messages.map((message, index) => {
        if (message.role === "user") {
          return (
            <div className={`${styles.message} ${styles.user}`} key={index}>
              {message.content}
            </div>
          );
        }
        if (message.content === "") {
          if (!(waiting && index === lastIndex)) return null;
          return (
            <div className={`${styles.message} ${styles.assistant}`} key={index}>
              <span className={styles.typing}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.srOnly}>{strings.typing}</span>
              </span>
            </div>
          );
        }
        return (
          <div className={`${styles.message} ${styles.assistant}`} key={index}>
            {linkify(message.content, linkOptions)}
          </div>
        );
      })}
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
