import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../scripts/env-file";
import { formatTable, formatTokens, type CaseResult } from "../scripts/rules-report";

const results: CaseResult[] = [
  { id: "hours", failure: null, rawDash: false },
  { id: "published-price", failure: 'reply does not contain "$65"', rawDash: true },
  { id: "slot", failure: null, rawDash: true },
];

describe("formatTable", () => {
  const lines = formatTable(results).split("\n");

  it("has a header and one line per case", () => {
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^case\s+result\s+raw dash\s+failing check$/);
  });

  it("shows pass or FAIL with the failing check", () => {
    expect(lines[1]).toMatch(/^hours\s+pass\s+no$/);
    expect(lines[2]).toMatch(/^published-price\s+FAIL\s+yes\s+reply does not contain "\$65"$/);
  });

  it("reports the raw dash column without turning it into a failure", () => {
    expect(lines[3]).toMatch(/^slot\s+pass\s+yes$/);
  });
});

describe("formatTokens", () => {
  it("prints input, cache read and output totals separately", () => {
    expect(formatTokens({ input: 1200, cacheRead: 9800, output: 450 })).toBe(
      "Tokens used: 1200 input, 9800 cache read, 450 output.",
    );
  });
});

describe("loadLocalEnv", () => {
  const dirs: string[] = [];
  const names = ["RULES_TEST_FROM_FILE", "RULES_TEST_PRESET"];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const name of names) delete process.env[name];
  });

  function envFile(text: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "rules-env-"));
    dirs.push(dir);
    const file = path.join(dir, ".env.local");
    writeFileSync(file, text);
    return file;
  }

  it("sets variables from the file", () => {
    loadLocalEnv(envFile("RULES_TEST_FROM_FILE=loaded\n"));
    expect(process.env.RULES_TEST_FROM_FILE).toBe("loaded");
  });

  it("does not replace a variable that is already set", () => {
    process.env.RULES_TEST_PRESET = "from the shell";
    loadLocalEnv(envFile("RULES_TEST_PRESET=from the file\n"));
    expect(process.env.RULES_TEST_PRESET).toBe("from the shell");
  });

  it("ignores a missing file", () => {
    expect(() =>
      loadLocalEnv(path.join(os.tmpdir(), "no-such-folder", ".env.local")),
    ).not.toThrow();
  });
});

describe("check-rules script", () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, "../scripts/check-rules.ts"),
    "utf8",
  );

  it("loads the environment file before any module that reads it", () => {
    const imports = [...source.matchAll(/^import\s+(?:.*?\s+from\s+)?"([^"]+)";$/gm)].map(
      (m) => m[1],
    );
    expect(imports[0]).toBe("./load-env");
    const loadIndex = source.indexOf('import "./load-env";');
    expect(loadIndex).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('from "@/content/business"')).toBeGreaterThan(loadIndex);
  });
});
