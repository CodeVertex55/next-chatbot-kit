"use client";

import { useEffect, useId, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { ChatStrings } from "../config";
import styles from "./chat.module.css";
import type { ChatStatus } from "./useChat";

const COUNTER_WITHIN = 100;

export interface ComposerProps {
  strings: ChatStrings;
  maxLength: number;
  status: ChatStatus;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ strings, maxLength, status, inputRef, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const id = useId();
  const counterId = `${id}-count`;
  const streaming = status === "streaming";
  const showCounter = maxLength - value.length <= COUNTER_WITHIN;

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  function submit() {
    if (streaming || value.trim() === "") return;
    onSend(value);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <div className={styles.composer}>
      <label className={styles.srOnly} htmlFor={id}>
        {strings.composerLabel}
      </label>
      <textarea
        id={id}
        ref={inputRef}
        className={styles.textarea}
        rows={1}
        value={value}
        maxLength={maxLength}
        placeholder={strings.composerPlaceholder}
        aria-describedby={showCounter ? counterId : undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {showCounter && (
        <span className={styles.counter} id={counterId}>
          {value.length}/{maxLength}
        </span>
      )}
      {streaming ? (
        <button className={styles.stopButton} type="button" onClick={onStop}>
          {strings.stop}
        </button>
      ) : (
        <button
          className={styles.sendButton}
          type="button"
          onClick={submit}
          disabled={value.trim() === ""}
        >
          {strings.send}
        </button>
      )}
    </div>
  );
}
