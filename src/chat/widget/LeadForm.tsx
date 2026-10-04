"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { PublicChatConfig } from "../config";
import styles from "./chat.module.css";
import { KEYS, writeStored } from "./storage";

type Field = "name" | "phone" | "email";
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: Field[] = ["name", "phone", "email"];

/**
 * The honeypot input's DOM name. It is not a word that browser autofill maps to a
 * saved value, so a real visitor's autofill leaves it empty. The value is still
 * posted under the key `company`, which is what the server reads.
 */
const HONEYPOT_NAME = "chatkit-extra";

export interface LeadFormProps {
  config: PublicChatConfig;
  endpoint: string;
  onDone: () => void;
  /** Given in optional mode. Shows the skip control. */
  onSkip?: () => void;
}

/** The field messages in a 400 body, keeping only text for known fields. */
function readErrors(body: unknown): { fields: FieldErrors; page: string | null } {
  const fields: FieldErrors = {};
  let page: string | null = null;
  if (typeof body !== "object" || body === null) return { fields, page };
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null) return { fields, page };
  const record = errors as Record<string, unknown>;
  for (const field of FIELDS) {
    const message = record[field];
    if (typeof message === "string" && message !== "") fields[field] = message;
  }
  if (typeof record.page === "string" && record.page !== "") page = record.page;
  return { fields, page };
}

export function LeadForm({ config, endpoint, onDone, onSkip }: LeadFormProps) {
  const { strings } = config;
  const baseId = useId();
  const [values, setValues] = useState({ name: "", phone: "", email: "", company: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const inputRefs = { name: nameRef, phone: phoneRef, email: emailRef };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          page: window.location.pathname,
          company: values.company,
        }),
      });

      if (response.ok) {
        writeStored("local", KEYS.leadDone, "1");
        onDone();
        return;
      }
      if (response.status === 429) {
        setFormError(strings.errorRateLimited);
      } else if (response.status === 400) {
        const { fields, page } = readErrors(await response.json().catch(() => null));
        const first = FIELDS.find((field) => fields[field] !== undefined);
        setErrors(fields);
        if (first === undefined) setFormError(page ?? strings.errorNetwork);
        else inputRefs[first].current?.focus();
      } else {
        setFormError(strings.errorNetwork);
      }
    } catch {
      setFormError(strings.errorNetwork);
    }
    setSubmitting(false);
  }

  const labels: Record<Field, string> = {
    name: strings.nameLabel,
    phone: strings.phoneLabel,
    email: strings.emailLabel,
  };
  const inputProps: Record<Field, { type: string; autoComplete: string }> = {
    name: { type: "text", autoComplete: "name" },
    phone: { type: "tel", autoComplete: "tel" },
    email: { type: "email", autoComplete: "email" },
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h2 className={styles.formTitle}>{strings.leadTitle}</h2>
      <p className={styles.formIntro}>{strings.leadIntro}</p>

      {FIELDS.map((field) => {
        const inputId = `${baseId}-${field}`;
        const errorId = `${inputId}-error`;
        const message = errors[field];
        return (
          <div className={styles.field} key={field}>
            <label className={styles.label} htmlFor={inputId}>
              {labels[field]}
            </label>
            <input
              id={inputId}
              ref={inputRefs[field]}
              className={styles.input}
              name={field}
              type={inputProps[field].type}
              autoComplete={inputProps[field].autoComplete}
              aria-required="true"
              value={values[field]}
              onChange={(event) => update(field, event.target.value)}
              aria-invalid={message === undefined ? undefined : true}
              aria-describedby={message === undefined ? undefined : errorId}
            />
            {message !== undefined && (
              <p className={styles.fieldError} id={errorId}>
                {message}
              </p>
            )}
          </div>
        );
      })}

      <div className={styles.honeypot} aria-hidden="true">
        <input
          id={`${baseId}-chatkit-extra`}
          name={HONEYPOT_NAME}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={values.company}
          onChange={(event) => update("company", event.target.value)}
        />
      </div>

      <p className={styles.note}>{strings.leadSensitiveNote}</p>
      {config.demoNotice !== undefined && <p className={styles.note}>{config.demoNotice}</p>}
      {config.privacyUrl !== undefined && (
        <p className={styles.note}>
          <a
            className={styles.link}
            href={config.privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {strings.privacyLinkText}
          </a>
        </p>
      )}

      {formError !== null && (
        <p className={styles.errorLine} role="alert">
          {formError}
        </p>
      )}

      <div className={styles.formActions}>
        <button className={styles.primaryButton} type="submit" disabled={submitting}>
          {strings.leadSubmit}
        </button>
        {onSkip !== undefined && (
          <button className={styles.secondaryButton} type="button" onClick={onSkip}>
            {strings.leadSkip}
          </button>
        )}
      </div>
    </form>
  );
}
