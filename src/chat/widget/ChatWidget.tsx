"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { PublicChatConfig } from "../config";
import { Composer } from "./Composer";
import { LeadForm } from "./LeadForm";
import { linkify } from "./linkify";
import { MessageList } from "./MessageList";
import styles from "./chat.module.css";
import { KEYS, readStored, writeStored } from "./storage";
import { useChat } from "./useChat";

type View = "closed" | "lead" | "chat";

export interface ChatWidgetProps {
  config: PublicChatConfig;
  chatEndpoint?: string;
  leadEndpoint?: string;
}

export function ChatWidget({
  config,
  chatEndpoint = "/api/chat",
  leadEndpoint = "/api/chat/lead",
}: ChatWidgetProps) {
  const { strings } = config;
  const [view, setView] = useState<View>("closed");
  const [leadSettled, setLeadSettled] = useState(false);
  const [callbackDone, setCallbackDone] = useState(false);
  const [greetingReady, setGreetingReady] = useState(false);
  const [greetingGone, setGreetingGone] = useState(false);
  const chat = useChat({
    endpoint: chatEndpoint,
    maxMessageChars: config.maxMessageChars,
    maxTurns: config.maxTurns,
  });
  const launcherRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();

  const { greetingDelayMs } = config;
  useEffect(() => {
    if (greetingDelayMs <= 0) return;
    if (readStored("local", KEYS.greetingDismissed) !== null) return;
    const timer = setTimeout(() => setGreetingReady(true), greetingDelayMs);
    return () => clearTimeout(timer);
  }, [greetingDelayMs]);

  const linkOptions = {
    siteHost: config.siteHost,
    phone: config.phone,
    phoneHref: config.phoneHref,
  };
  const showGreeting = greetingReady && !greetingGone && view === "closed";

  function open() {
    setGreetingGone(true);
    const needsLead =
      config.leadMode !== "off" && !leadSettled && readStored("local", KEYS.leadDone) === null;
    setView(needsLead ? "lead" : "chat");
  }

  function close() {
    setView("closed");
    launcherRef.current?.focus();
  }

  function dismissGreeting() {
    writeStored("local", KEYS.greetingDismissed, "1");
    setGreetingGone(true);
  }

  function leadDone() {
    setLeadSettled(true);
    if (config.leadMode === "off") setCallbackDone(true);
    setView("chat");
  }

  function leadSkipped() {
    setLeadSettled(true);
    setView("chat");
  }

  function sendSuggestion(text: string) {
    void chat.send(text);
    composerRef.current?.focus();
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close();
  }

  const rootStyle = { "--chat-accent": config.accent } as CSSProperties;
  const errorText =
    chat.error === "rate-limited"
      ? strings.errorRateLimited
      : chat.error === "network"
        ? strings.errorNetwork
        : null;

  return (
    <div className={styles.root} style={rootStyle}>
      {showGreeting && (
        <div className={styles.greeting}>
          <button className={styles.greetingText} type="button" onClick={open}>
            {config.greeting}
          </button>
          <button
            className={styles.greetingDismiss}
            type="button"
            aria-label={strings.greetingDismiss}
            onClick={dismissGreeting}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      {view !== "closed" && (
        <div
          className={styles.panel}
          id={panelId}
          role="dialog"
          aria-label={strings.panelLabel}
          onKeyDown={onPanelKeyDown}
        >
          <div className={styles.header}>
            <div className={styles.headerText}>
              <p className={styles.personaName}>{config.persona.name}</p>
              <p className={styles.personaLabel}>{config.persona.label}</p>
            </div>
            {config.leadMode === "off" && view === "chat" && !callbackDone && (
              <button className={styles.headerButton} type="button" onClick={() => setView("lead")}>
                {strings.callbackButton}
              </button>
            )}
            <button
              className={styles.closeButton}
              type="button"
              aria-label={strings.launcherClose}
              onClick={close}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          {view === "lead" ? (
            <div className={styles.body}>
              <LeadForm
                config={config}
                endpoint={leadEndpoint}
                onDone={leadDone}
                onSkip={config.leadMode === "optional" ? leadSkipped : undefined}
              />
            </div>
          ) : (
            <div className={styles.body}>
              {callbackDone && (
                <p className={styles.status} role="status">
                  {strings.callbackDone}
                </p>
              )}
              <MessageList
                messages={chat.messages}
                status={chat.status}
                strings={strings}
                linkOptions={linkOptions}
              />
              {chat.messages.length === 0 && config.suggestions.length > 0 && (
                <div className={styles.chips}>
                  {config.suggestions.map((suggestion) => (
                    <button
                      className={styles.chip}
                      type="button"
                      key={suggestion}
                      onClick={() => sendSuggestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {errorText !== null && (
                <p className={styles.errorLine} role="alert">
                  {linkify(errorText, linkOptions)}
                  {!errorText.includes(config.phone) && (
                    <>
                      {" "}
                      <a href={config.phoneHref}>{config.phone}</a>
                    </>
                  )}
                </p>
              )}
              <Composer
                strings={strings}
                maxLength={config.maxMessageChars}
                status={chat.status}
                inputRef={composerRef}
                onSend={(text) => void chat.send(text)}
                onStop={chat.stop}
              />
            </div>
          )}
        </div>
      )}

      <button
        ref={launcherRef}
        className={styles.launcher}
        type="button"
        aria-expanded={view !== "closed"}
        aria-controls={panelId}
        onClick={view === "closed" ? open : close}
      >
        <span className={styles.srOnly}>
          {view === "closed" ? strings.launcherOpen : strings.launcherClose}
        </span>
        <svg
          className={styles.launcherIcon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
          />
        </svg>
      </button>
    </div>
  );
}
