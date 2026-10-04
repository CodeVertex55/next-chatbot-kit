import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8")) as {
  version: string;
  dependencies: Record<string, string>;
};

describe("package manifest", () => {
  it("is version 1.0.0", () => {
    expect(pkg.version).toBe("1.0.0");
  });

  it("has exactly the four runtime dependencies", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "@anthropic-ai/sdk",
      "next",
      "react",
      "react-dom",
    ]);
  });
});
