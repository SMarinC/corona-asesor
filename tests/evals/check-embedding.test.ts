import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("evals/check-embedding.ts", () => {
  // process.exit() with a pending fetch handle trips a libuv assertion on Windows (exit 127): set the code and let Node drain.
  it("sets process.exitCode instead of calling process.exit()", () => {
    const source = readFileSync("evals/check-embedding.ts", "utf8");
    expect(source).not.toMatch(/process\.exit\(/);
    expect(source).toMatch(/process\.exitCode\s*=/);
  });
});
