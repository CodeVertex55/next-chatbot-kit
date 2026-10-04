# Deploy

This page covers deploying to Vercel, the environment variables, setting a spend limit, and swapping in a shared rate-limit store. Any host that runs Next.js on Node should work, but the steps below are for Vercel.

The two chat routes use the Node.js runtime and are never cached. They stream their reply, so they need a host that supports streaming responses.

## Before you deploy

1. Run `npm run check` and `npm run build` locally.
2. Write your own content file and config. Do not ship the demo practice.
3. Write your own privacy page and set `privacyUrl`.
4. Run `npm run check:rules` with a key and read the table.
5. Set a spend limit with Anthropic. See [Set a spend limit](#set-a-spend-limit).

## Deploy to Vercel

1. Push your project to a Git host that Vercel supports.
2. In Vercel, choose to add a new project and import the repository. Vercel detects Next.js and fills in the build settings.
3. Open the project's environment variable settings and add the variables from the next section. At minimum add `ANTHROPIC_API_KEY` and `SITE_URL`.
4. Deploy.
5. Open the live site, open the chat, and send a message. Check the callback form too.

Vercel sets the `x-forwarded-for` header. The kit reads the visitor's address from it for rate limiting. If you use another host, make sure a proxy in front of the app sets it. See [Security](security.md).

Changes to environment variables apply to new deployments. Redeploy after you change one.

## Environment variables

None are required for the app to build and run. Without a key it uses [holding mode](../README.md#holding-mode).

| Variable               | Set it to                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | Your Anthropic API key. Keep it as a secret and never put it in the repository.         |
| `CHAT_MODEL`           | A model id. Leave empty for the default. See [Model choice](../README.md#model-choice). |
| `CHAT_DAILY_LIMIT`     | A whole number. See below.                                                              |
| `CHAT_ALLOWED_ORIGINS` | Extra hosts that may call the routes. See below.                                        |
| `SITE_URL`             | The public address of your site, for example `https://example.com`.                     |
| `RESEND_API_KEY`       | Your Resend API key, to email leads.                                                    |
| `LEAD_EMAIL_TO`        | The address that receives lead emails.                                                  |
| `LEAD_EMAIL_FROM`      | A sender address on a domain verified with Resend.                                      |
| `LEAD_WEBHOOK_URL`     | An `https` address that receives each lead as JSON.                                     |

Set up at least one of email or webhook before launch. With neither, a lead is dropped and only a one-line notice is logged.

### CHAT_DAILY_LIMIT

The most model calls the chat route will make per UTC day. When the count is reached, visitors get the holding reply until the next UTC day. Empty, zero or a value that is not a number means no limit.

The count is kept in memory by each server instance. On a host that runs several instances, each one counts on its own. Treat the number as a rough guard. It does not replace a spend limit.

### CHAT_ALLOWED_ORIGINS

The routes accept a request only when its `Origin` header matches the site's own host or a host in this list. A request with no `Origin` header is refused.

Use the list when the site is reached on more than one host. For example, if the site answers on both `example.com` and `www.example.com`, the site's own host covers one and the list must name the other:

```bash
CHAT_ALLOWED_ORIGINS=www.example.com
```

Separate several entries with commas. Each entry can be a host or a full address. Only the host part is used.

## Set a spend limit

The Anthropic console is where you stop billing. The kit limits how many requests it will make, but only a limit set with Anthropic caps what you can be charged.

1. Sign in to the Anthropic console.
2. Open the billing or limits settings for the workspace that holds your key.
3. Set a monthly spend limit you are comfortable with.
4. Use a key made for this site, so you can revoke it without touching anything else.

The menu names change from time to time. If you cannot find the setting, check Anthropic's documentation. For prices, see [Anthropic pricing](https://www.anthropic.com/pricing).

## Swap in a shared rate-limit store

The built-in rate limiter keeps its counts in the memory of one server instance. On a host that runs several instances, or restarts them often, a visitor can get more requests through than the limit says. To count across instances, give the handlers a store that lives outside the process, such as Redis.

A store implements one method:

```ts
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
}
```

`hit` adds one to the count for `key` and returns the new count and the time, in milliseconds since the epoch, when the window ends. The first hit for a key starts a window of `windowMs`.

Here is an example against a Redis-style client. The client type and the commands are only a sketch, so adapt the names to the library you use.

```ts
import type { RateLimitStore } from "@/chat";

interface SharedKv {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

export function createSharedStore(kv: SharedKv): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      const count = await kv.incr(key);
      if (count === 1) await kv.pexpire(key, windowMs);
      const ttl = await kv.pttl(key);
      return { count, resetAt: now + Math.max(ttl, 0) };
    },
  };
}
```

Pass the store to both handlers. The keys are prefixed with `chat:` and `lead:`, so one store serves both routes:

```ts
const store = createSharedStore(yourClient);

export const POST = createChatHandler({ content: business, config: chatConfig, store });
```

```ts
export const POST = createLeadHandler({ content: business, config: chatConfig, store });
```

Put the store in a module that both route files import, so they share one client.

Two limits to know about. If the process stops between `incr` and `pexpire`, that key never expires, so use a script or transaction if your store supports one. And the daily call limit is still counted in memory, because it has no shared store.
