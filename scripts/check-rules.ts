/**
 * Live rules check. Sends a short list of test questions to the real model,
 * using the system prompt built from your content file and config, and checks
 * each reply at string level. It needs ANTHROPIC_API_KEY and uses API credit.
 * Run it with: npm run check:rules
 *
 * No reply text is written to disk. Only the table of results is printed.
 */
import path from "node:path";
import { DEFAULT_MODEL, buildSystemPrompt, createAnthropicClient } from "@/chat";
import { chatConfig } from "@/chat.config";
import { createPunctuationFilter } from "../src/chat/stream";
import { business } from "@/content/business";
import { RULE_CASES, evaluateReply, type CaseContext, type RuleCase } from "./rules-cases";

interface Result {
  id: string;
  failure: string | null;
}

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "..", ".env.local"));
} catch {
  // There is no .env.local. The key may still be set in the environment.
}

function errorLabel(error: unknown): string {
  const name = error instanceof Error && error.name !== "" ? error.name : "unknown error";
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? `${name} ${status}` : name;
}

async function runCase(
  rule: RuleCase,
  client: ReturnType<typeof createAnthropicClient>,
  model: string,
  context: CaseContext,
  tokens: { input: number; output: number },
): Promise<Result> {
  try {
    const stream = client.stream({
      model,
      system: context.systemPrompt,
      messages: [{ role: "user", content: rule.prompt }],
      maxTokens: chatConfig.limits.maxOutputTokens,
    });
    const filter = createPunctuationFilter();
    let reply = "";
    for await (const chunk of stream.textChunks) reply += filter.push(chunk);
    reply += filter.flush();
    const outcome = await stream.done;
    tokens.input += outcome.usage.input;
    tokens.output += outcome.usage.output;
    return { id: rule.id, failure: evaluateReply(rule, reply.trim(), context) };
  } catch (error) {
    return { id: rule.id, failure: `request failed (${errorLabel(error)})` };
  }
}

function printTable(results: Result[]): void {
  const width = Math.max(...results.map((result) => result.id.length), "case".length);
  const line = (id: string, status: string, note: string): string =>
    `${id.padEnd(width)}  ${status.padEnd(6)}  ${note}`.trimEnd();
  console.log(line("case", "result", "failing check"));
  for (const result of results) {
    console.log(line(result.id, result.failure === null ? "pass" : "FAIL", result.failure ?? ""));
  }
}

async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (apiKey === "") {
    console.log("ANTHROPIC_API_KEY is not set. Skipping the live rules check.");
    return 0;
  }

  const model = process.env.CHAT_MODEL?.trim() || DEFAULT_MODEL;
  const context: CaseContext = {
    systemPrompt: buildSystemPrompt(business, chatConfig),
    phone: business.phone,
    email: business.email,
  };
  const client = createAnthropicClient(apiKey);
  const tokens = { input: 0, output: 0 };

  console.log(`Checking ${RULE_CASES.length} cases with model ${model}.`);
  const results: Result[] = [];
  for (const rule of RULE_CASES) {
    results.push(await runCase(rule, client, model, context, tokens));
  }

  console.log("");
  printTable(results);
  const failed = results.filter((result) => result.failure !== null).length;
  console.log("");
  console.log(`${results.length - failed} of ${results.length} cases passed.`);
  console.log(
    `Tokens used: ${tokens.input + tokens.output} (${tokens.input} in, ${tokens.output} out).`,
  );
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Rules check stopped: ${errorLabel(error)}`);
    process.exitCode = 1;
  },
);
