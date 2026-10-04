import { toPublicConfig } from "@/chat/config";
import type { PublicChatConfig } from "@/chat/config";
import { testConfig, testContent } from "../fixtures";

export function publicConfig(overrides: Partial<PublicChatConfig> = {}): PublicChatConfig {
  return { ...toPublicConfig(testConfig, testContent), ...overrides };
}

/** A response with just what the widget reads. */
export function fakeResponse(init: { status?: number; body?: unknown }): Response {
  const status = init.status ?? 200;
  const body = init.body;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: body instanceof ReadableStream ? body : null,
    json: async () => body,
  } as unknown as Response;
}

export function textResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return fakeResponse({ body: stream });
}

export function jsonResponse(status: number, body: unknown): Response {
  return fakeResponse({ status, body });
}

/** A stream the test feeds by hand, to look at state between chunks. */
export function controlledResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: fakeResponse({ body: stream }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: (reason: unknown) => controller.error(reason),
  };
}
