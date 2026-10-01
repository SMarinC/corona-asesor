import { describe, expect, it } from "vitest";
import pkg from "@/package.json";

describe("tooling", () => {
  it("resolves the @ alias to the repo root", () => {
    expect(pkg.name).toBe("corona-asesor");
  });
});
