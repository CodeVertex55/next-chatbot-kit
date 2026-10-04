"use client";

import type { ReactNode } from "react";

export interface LinkifyOptions {
  siteHost: string;
  phone: string;
  phoneHref: string;
}

const TRAILING = ".,)";

function isSpace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

/** The end of the run of non-space characters that starts at `start`. */
function tokenEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && !isSpace(text.charAt(end))) end += 1;
  return end;
}

/** Moves `end` back past trailing punctuation, but never before `floor`. */
function trimEnd(text: string, end: number, floor: number): number {
  let trimmed = end;
  while (trimmed > floor && TRAILING.includes(text.charAt(trimmed - 1))) trimmed -= 1;
  return trimmed;
}

/** True when the character after the host cannot continue a different host. */
function endsHost(text: string, index: number, end: number): boolean {
  if (index >= end) return true;
  const next = text.charAt(index);
  return next === "/" || next === "?" || next === "#";
}

/**
 * Turns two things into links: https URLs on the site's own host and the
 * business phone number. Everything else stays plain text.
 */
export function linkify(text: string, options: LinkifyOptions): ReactNode[] {
  const { siteHost, phone, phoneHref } = options;
  const prefix = siteHost === "" ? "" : `https://${siteHost}`;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let searchUrl = prefix !== "";
  let searchPhone = phone !== "";
  let urlAt = -1;
  let phoneAt = -1;

  const flush = (upTo: number) => {
    if (upTo > cursor) nodes.push(text.slice(cursor, upTo));
  };

  while (cursor < text.length) {
    if (searchUrl && urlAt < cursor) {
      urlAt = text.indexOf(prefix, cursor);
      if (urlAt === -1) searchUrl = false;
    }
    if (searchPhone && phoneAt < cursor) {
      phoneAt = text.indexOf(phone, cursor);
      if (phoneAt === -1) searchPhone = false;
    }
    if (!searchUrl && !searchPhone) break;

    const useUrl = searchUrl && (!searchPhone || urlAt <= phoneAt);
    if (useUrl) {
      const start = urlAt;
      const end = trimEnd(text, tokenEnd(text, start), start + prefix.length);
      if (endsHost(text, start + prefix.length, end)) {
        flush(start);
        const url = text.slice(start, end);
        nodes.push(
          <a key={nodes.length} href={url}>
            {url}
          </a>,
        );
        cursor = end;
      } else {
        // Same start but a different host, such as example.com.other.test.
        flush(start + prefix.length);
        cursor = start + prefix.length;
      }
    } else {
      flush(phoneAt);
      nodes.push(
        <a key={nodes.length} href={phoneHref}>
          {phone}
        </a>,
      );
      cursor = phoneAt + phone.length;
    }
  }

  flush(text.length);
  return nodes;
}
