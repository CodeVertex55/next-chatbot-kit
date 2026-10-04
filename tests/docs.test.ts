import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

const SKIPPED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "coverage",
  "playwright-report",
  "test-results",
]);
const SKIPPED_FILES = new Set(["package-lock.json", "next-env.d.ts", "tsconfig.tsbuildinfo"]);

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function isSkipped(relative: string): boolean {
  const parts = relative.split("/");
  const name = parts[parts.length - 1] ?? "";
  if (parts.slice(0, -1).some((part) => SKIPPED_DIRS.has(part))) return true;
  if (SKIPPED_FILES.has(name)) return true;
  return name.startsWith(".env") && name !== ".env.example";
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const relative = dir === "" ? entry : `${dir}/${entry}`;
    if (isSkipped(relative)) continue;
    if (statSync(path.join(ROOT, relative)).isDirectory()) found.push(...walk(relative));
    else found.push(relative);
  }
  return found;
}

/** Tracked files and new files that are not ignored. Falls back to a directory walk without git. */
function projectFiles(): string[] {
  let files: string[];
  try {
    const listing = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    files = listing.split("\0").filter((file) => file !== "" && existsSync(path.join(ROOT, file)));
  } catch {
    files = walk("");
  }
  return files.filter((file) => !isSkipped(file));
}

function isText(relative: string): boolean {
  return !readFileSync(path.join(ROOT, relative)).includes(0);
}

function markdownFiles(): string[] {
  const docs = readdirSync(path.join(ROOT, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`);
  const top = readdirSync(ROOT).filter((name) => name.endsWith(".md"));
  return [...top, ...docs];
}

/** Link targets in Markdown inline links, ignoring code fences. */
function linkTargets(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  const targets: string[] = [];
  for (const match of withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (match[1] !== undefined) targets.push(match[1]);
  }
  return targets;
}

function isRelative(target: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target);
}

/** The text of one `## ` section, without its heading line. */
function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) throw new Error(`No section named ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("documentation files", () => {
  it("exist", () => {
    for (const file of [
      "README.md",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "LICENSE",
      "docs/system-prompt-template.md",
      "docs/writing-rules.md",
      "docs/deploy.md",
      "docs/security.md",
      ".github/workflows/ci.yml",
    ]) {
      expect(existsSync(path.join(ROOT, file)), file).toBe(true);
    }
  });

  it("gives the README its sections in order", () => {
    const headings = read("README.md")
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3));
    expect(headings).toEqual([
      "Quick start",
      "Add it to your own site",
      "Config reference",
      "Environment variables",
      "Lead delivery",
      "Model choice",
      "Holding mode",
      "Privacy",
      "Limits",
      "Theming",
      "Testing",
      "Licence",
    ]);
  });
});

describe("relative links", () => {
  for (const file of markdownFiles()) {
    it(`point to files that exist in ${file}`, () => {
      const base = path.dirname(path.join(ROOT, file));
      const missing = linkTargets(read(file))
        .filter(isRelative)
        .filter((target) => {
          const withoutAnchor = target.split("#")[0] ?? "";
          if (withoutAnchor === "") return false;
          return !existsSync(path.resolve(base, decodeURIComponent(withoutAnchor)));
        });
      expect(missing).toEqual([]);
    });
  }
});

describe("environment variables", () => {
  const exampleNames = read(".env.example")
    .split("\n")
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);

  const tableNames = section(read("README.md"), "Environment variables")
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => /^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);

  it("lists at least one variable in each place", () => {
    expect(exampleNames.length).toBeGreaterThan(0);
    expect(tableNames.length).toBeGreaterThan(0);
  });

  it("has every .env.example variable in the README table", () => {
    expect(exampleNames.filter((name) => !tableNames.includes(name))).toEqual([]);
  });

  it("has no README table variable missing from .env.example", () => {
    expect(tableNames.filter((name) => !exampleNames.includes(name))).toEqual([]);
  });
});

describe("punctuation", () => {
  it("keeps em dashes and en dashes out of every project text file", () => {
    const offenders = projectFiles()
      .filter(isText)
      .filter((file) => {
        const text = read(file);
        return text.includes(EM_DASH) || text.includes(EN_DASH);
      });
    expect(offenders).toEqual([]);
  });
});
