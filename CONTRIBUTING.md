# Contributing

Thanks for taking an interest. Small fixes and clear bug reports are welcome. For a larger change, open an issue first so we can agree on the approach.

## Setup

You need Node 22 or newer.

```bash
git clone https://github.com/talha55/next-chatbot-kit.git
cd next-chatbot-kit
npm install
cp .env.example .env.local
npm run dev
```

Leave `ANTHROPIC_API_KEY` empty for everyday work. The chat then gives the holding reply and needs no network.

## Before you open a pull request

```bash
npm run check
npm run coverage
npm run build
npm run e2e
```

- `npm run check` runs ESLint, the TypeScript check, the Prettier check and the unit tests. `npm run format` fixes formatting.
- `npm run coverage` fails if line coverage of `src/chat` is below 90 percent.
- `npm run e2e` builds the app and runs the Playwright smoke tests. Run `npx playwright install chromium` once first.

Write the test first, watch it fail, then make the change. Pull requests that change behaviour should include a test.

## Ground rules

- `src/chat` imports nothing from outside itself except npm packages. Server code goes through `src/chat/index.ts` and the widget through `src/chat/widget/index.ts`.
- The runtime dependencies are `next`, `react`, `react-dom` and `@anthropic-ai/sdk`. Do not add another.
- Never log or store visitor message text, lead details or IP addresses.
- Keys come from environment variables only. Never commit one.
- Write prose, comments and commit messages in short sentences. Do not use em dashes, en dashes or exclamation marks. A test checks for the dashes.

## Writing rules

The prompt rules are part of the product. If you change `src/chat/rules.ts` or the example `extraRules`, read [docs/writing-rules.md](docs/writing-rules.md). Update the cases in `scripts/rules-cases.ts` to match, and run `npm run check:rules` if you have a key.

## Examples and demo content

The demo is a fictional practice, Wren Street Dental in Marlow Bay. Keep examples, tests and docs fictional. Do not put in real business names, real people, real phone numbers or addresses, or real conversations.

## Documentation

Docs must describe what the code does. If you change a default, a status code or a check, update the README and the pages in `docs/` in the same pull request. `npm test` checks that links in the docs point to files that exist and that the environment table matches `.env.example`.
