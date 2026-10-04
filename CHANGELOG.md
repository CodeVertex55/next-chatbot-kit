# Changelog

## 1.0.0 (2026-10-04)

First release.

- Chat widget for Next.js: launcher, greeting bubble, suggestion chips, streaming replies, stop button, keyboard and focus handling, and a conversation that survives page changes within a tab.
- Streaming chat route that sends plain text, with a punctuation filter that rewrites em dashes and en dashes.
- System prompt builder that turns a business content file and a short config into a prompt with built-in truthfulness rules and your own `extraRules`.
- Callback form with three modes: required, optional and off. Lead delivery by email through Resend, by webhook, or to the console.
- Guard rails: origin check, per-address rate limits, request size and message validation, a daily call limit, and a swappable `RateLimitStore`.
- Holding mode: a fixed reply with the phone number and email when there is no API key or the daily limit is reached. Safe fallback replies when the model fails or refuses.
- Default model `claude-opus-5-5` at low effort, with `CHAT_MODEL` to choose another.
- Theming through CSS custom properties and an `accent` colour.
- Live rules check, `npm run check:rules`, with twelve cases that run against the real model.
- Demo site for a fictional dental practice.
- Documentation: README, system prompt template, writing rules, deploy guide and security notes.
- Continuous integration with lint, type check, format check, unit tests with a coverage threshold, build and browser smoke tests.
