/**
 * Live rules check. Sends a short list of test questions to the real model,
 * using the system prompt built from your content file and config, and checks
 * each reply at string level. It needs ANTHROPIC_API_KEY and uses API credit.
 * Run it with: npm run check:rules
 *
 * No reply text is written to disk. Only the table of results is printed.
 */
import "./load-env";
import { DEFAULT_MODEL, buildSystemPrompt, createAnthropicClient } from "@/chat";
import { chatConfig } from "@/chat.config";
import { createPunctuationFilter } from "../src/chat/stream";
import { business } from "@/content/business";
import {
  RULE_CASES,
  containsDash,
  evaluateReply,
  type CaseContext,
  type RuleCase,
} from "./rules-cases";
import { formatTable, formatTokens, type CaseResult, type TokenTotals } from "./rules-report";

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
  tokens: TokenTotals,
): Promise<CaseResult> {
  try {
    const stream = client.stream({
      model,
      system: context.systemPrompt,
      messages: [{ role: "user", content: rule.prompt }],
      maxTokens: chatConfig.limits.maxOutputTokens,
    });
    const filter = createPunctuationFilter();
    let raw = "";
    let reply = "";
    for await (const chunk of stream.textChunks) {
      raw += chunk;
      reply += filter.push(chunk);
    }
    reply += filter.flush();
    const outcome = await stream.done;
    tokens.input += outcome.usage.input;
    tokens.cacheRead += outcome.usage.cacheRead;
    tokens.output += outcome.usage.output;
    return {
      id: rule.id,
      failure: evaluateReply(rule, reply.trim(), context),
      rawDash: containsDash(raw),
    };
  } catch (error) {
    return { id: rule.id, failure: `request failed (${errorLabel(error)})`, rawDash: false };
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
  const tokens: TokenTotals = { input: 0, cacheRead: 0, output: 0 };

  console.log(`Checking ${RULE_CASES.length} cases with model ${model}.`);
  const results: CaseResult[] = [];
  for (const rule of RULE_CASES) {
    results.push(await runCase(rule, client, model, context, tokens));
  }

  console.log("");
  console.log(formatTable(results));
  const failed = results.filter((result) => result.failure !== null).length;
  console.log("");
  console.log(`${results.length - failed} of ${results.length} cases passed.`);
  const rawDashes = results.filter((result) => result.rawDash).length;
  console.log(
    `${rawDashes} of ${results.length} raw replies held a dash character. This is reported only. The filter removes them before the checks run.`,
  );
  console.log(formatTokens(tokens));
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
