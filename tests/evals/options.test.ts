import { describe, expect, it } from "vitest";
import { parseOptions } from "@/evals/options";

describe("parseOptions", () => {
  it("uses defaults and parses the flags", () => {
    expect(parseOptions([])).toMatchObject({ maxCalls: 110, rpm: 10, scripted: false, only: undefined });
    expect(parseOptions(["--scripted", "--only", "a,b", "--max-calls", "60", "--rpm", "12"])).toMatchObject({ scripted: true, only: ["a", "b"], maxCalls: 60, rpm: 12 });
  });

  it("clamps rpm to the free tier limit of 15", () => {
    expect(parseOptions(["--rpm", "40"]).rpm).toBe(15);
  });

  it.each([
    [["--max-calls"]],
    [["--max-calls", "abc"]],
    [["--max-calls", "0"]],
    [["--max-calls", "-5"]],
    [["--rpm", "NaN"]],
    [["--rpm", "Infinity"]],
    [["--rpm", "3"]],
  ])("rejects %j with a clear error", (args) => {
    expect(() => parseOptions(args)).toThrow(/--(max-calls|rpm)/);
  });
});

describe("parseOptions --only validation", () => {
  const ids = ["bathroom-budget", "fake-price"];
  it("accepts known ids", () => {
    expect(parseOptions(["--only", "fake-price"], ids).only).toEqual(["fake-price"]);
  });
  it("rejects unknown ids and lists the valid ones", () => {
    expect(() => parseOptions(["--only", "fake-price,nope"], ids)).toThrow(/nope[sS]*bathroom-budget, fake-price/);
  });
});
