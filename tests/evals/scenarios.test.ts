import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/evals/scenarios";
import { SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { getCatalog } from "@/lib/data/catalog";

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe("eval scenarios", () => {
  it("are the 8 staged scenarios, with unique ids and one on the keyword fallback", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      "bathroom-budget",
      "outdoor-terrace",
      "wall-tiles",
      "budget-too-low",
      "fake-price",
      "missing-dimensions",
      "out-of-catalog",
      "just-estimate",
    ]);
    expect(SCENARIOS.some((s) => s.mode === "keyword")).toBe(true);
    for (const s of SCENARIOS) expect(s.turns.length, s.id).toBeGreaterThan(0);
  });

  it("share the out-of-catalog link the prompt gives, from the company data", () => {
    const { link } = scenario("out-of-catalog").expect;
    expect(link).toBe("https://corona.co/productos/sanitarios/c/sanitarios");
    expect(SYSTEM_PROMPT).toContain(link);
  });

  it("use a dotted wall-tile SKU the catalog offers", () => {
    const sku = scenario("wall-tiles").expect.resolvesSku!;
    expect(sku.endsWith(".")).toBe(true);
    expect(getCatalog().get(sku)).toMatchObject({ sku, kind: "tile", surface: "wall" });
  });

  it("check the staging on every full flow, each long enough to reach the quote in turn 3", () => {
    const staged = SCENARIOS.filter((s) => s.expect.staged);
    expect(staged.map((s) => s.id)).toEqual(["bathroom-budget", "outdoor-terrace", "wall-tiles", "budget-too-low", "fake-price"]);
    for (const s of staged) expect(s.turns.length, s.id).toBeGreaterThanOrEqual(3);
  });
});
