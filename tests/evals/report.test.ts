import { describe, expect, it } from "vitest";
import { type EvalRun, renderReport, type ScenarioResult, scenarioPassed, summarize, type TurnResult } from "@/evals/report";
import type { Check, TurnMetrics } from "@/evals/score";

const ok = (name: string): Check => ({ name, ok: true, detail: "ok" });
const bad = (name: string, detail: string): Check => ({ name, ok: false, detail });

const turn = (metrics: Partial<TurnMetrics> = {}, over: Partial<TurnResult> = {}): TurnResult => ({
  checks: [ok("completed")],
  metrics: { outcome: "ok", steps: 2, durationMs: 1_000, inputTokens: 3_000, outputTokens: 200, moneyNotFromTools: [], inventedQuantities: [], ...metrics },
  keywordFallbacks: 0,
  answer: "Listo.",
  trace: [],
  ...over,
});

const scenario = (id: string, turns: TurnResult[] | null, checks: Check[] = [], skippedReason?: string): ScenarioResult => ({
  id,
  title: `Escenario ${id}`,
  mode: "semantic",
  turns,
  checks,
  ...(skippedReason ? { skippedReason } : {}),
});

const runOf = (results: ScenarioResult[], subset = false): EvalRun => ({
  date: "2026-10-06",
  model: "gemini-3.5-flash-lite",
  promptVersion: "2026-10-06.4",
  calls: { used: 14, steps: 12, embeddings: 1 },
  subset,
  results,
});

describe("scenarioPassed", () => {
  it("needs every turn check and every scenario check to pass, and a run", () => {
    expect(scenarioPassed(scenario("a", [turn()], [ok("quote:within")]))).toBe(true);
    expect(scenarioPassed(scenario("a", [turn()], [bad("quote:over", "withinBudget true")]))).toBe(false);
    expect(scenarioPassed(scenario("a", [turn({}, { checks: [bad("steps", "8 pasos")] })]))).toBe(false);
    expect(scenarioPassed(scenario("a", null, [], "call budget reached"))).toBe(false);
  });
});

describe("summarize", () => {
  it("counts money, quantities and gate rejections, and takes steps and p95 latency over completed turns only", () => {
    const run = runOf([
      scenario("a", [turn({ steps: 2, durationMs: 1_000 }), turn({ steps: 4, durationMs: 3_000, moneyNotFromTools: [6000] })]),
      scenario("b", [
        turn({ steps: 3, durationMs: 2_000, inventedQuantities: ["G2:not_computed"] }, { trace: [{ tool: "computeMaterials", status: "rejected", input: {} }] }),
        turn({ outcome: "timeout", steps: 9, durationMs: 60_000 }),
      ]),
      scenario("c", [turn({ outcome: "error", steps: 0, durationMs: 50_000 })]),
      scenario("d", null, [], "call budget reached"),
    ]);
    expect(summarize(run)).toEqual({
      // Passing is the checks' call; the metrics only feed the counts.
      passed: 3,
      run: 3,
      total: 4,
      moneyNotFromTools: 1,
      inventedQuantities: 1,
      medianSteps: 3,
      p95LatencyMs: 3_000,
      timeouts: 1,
      rejectedCalls: 1,
      calls: { used: 14, steps: 12, embeddings: 1 },
      promptVersion: "2026-10-06.4",
      meetsBar: false,
    });
  });

  it("meets the bar when every scenario ran, at most one failed, and no money or quantity was invented", () => {
    const passing = scenario("a", [turn()]);
    const failing = scenario("b", [turn()], [bad("link", "sin el enlace")]);
    const notRun = scenario("c", null, [], "call budget reached");
    expect(summarize(runOf([passing, passing, failing])).meetsBar).toBe(true);
    expect(summarize(runOf([passing, failing, failing])).meetsBar).toBe(false);
    // One scenario short of the full run is not a pass, even with every other scenario passing.
    expect(summarize(runOf([passing, passing, notRun])).meetsBar).toBe(false);
    expect(summarize(runOf([passing, scenario("c", [turn({ moneyNotFromTools: [1] })])])).meetsBar).toBe(false);
    expect(summarize(runOf([passing, scenario("c", [turn({ inventedQuantities: ["T1:differs"] })])])).meetsBar).toBe(false);
  });

  it("does not judge the bar on an --only subset", () => {
    expect(summarize(runOf([scenario("a", [turn()])], true)).meetsBar).toBeNull();
    expect(renderReport(runOf([scenario("a", [turn()])], true))).toContain("| Success bar (all scenarios ran, passed ≥ total − 1, 0 money not from tools, 0 invented quantities) | n/a (--only subset) |");
  });
});

describe("renderReport", () => {
  const run = runOf([
    scenario(
      "bathroom",
      [
        turn({ steps: 2 }, { trace: [{ tool: "searchTiles", status: "ok", input: {} }], answer: "Te propongo tres pisos | grises.\n¿Cuál prefieres?" }),
        turn(
          { steps: 3, durationMs: 2_500, inputTokens: 9_000, outputTokens: 400, moneyNotFromTools: [6000] },
          {
            checks: [bad("money-from-tools", "montos que no salieron de una tool ni del cliente: 6000")],
            trace: [
              { tool: "getProduct", status: "error", error: "unknown_sku", input: {} },
              { tool: "searchSupplies", status: "rejected", input: {} },
              { tool: "computeMaterials", status: "needs_review", input: {} },
            ],
            answer: "x".repeat(300),
          },
        ),
      ],
      [bad("quote:within", "sin cotización")],
    ),
    scenario("terrace", null, [], "call budget reached (100/110; this scenario can need 40)"),
  ]);
  const markdown = renderReport(run);

  it("opens with the summary and the success bar", () => {
    expect(markdown).toContain("| Scenarios passed | **0/2** (1 not run) |");
    expect(markdown).toContain("| Money in answers not from a tool or the customer | 1 |");
    expect(markdown).toContain("| Quote quantities not from computeMaterials | 0 |");
    expect(markdown).toContain("| Median steps per turn (completed turns) | 2 |");
    expect(markdown).toContain("| Turn latency p95 (completed turns) | 2.5 s |");
    expect(markdown).toContain("| Timeouts | 0 |");
    expect(markdown).toContain("| Herramientas fuera de paso (calls the stage gate rejected; not failures) | 1 |");
    expect(markdown).toContain("| Model calls spent | 14 (12 steps summed) · 1 embedding queries |");
    expect(markdown).toContain("| Prompt version | `2026-10-06.4` |");
    expect(markdown).toContain("| Success bar (all scenarios ran, passed ≥ total − 1, 0 money not from tools, 0 invented quantities) | **not met** |");
  });

  it("shows each scenario's result, its failing checks and, per turn, steps, outcome, latency, tokens, tools and an answer excerpt", () => {
    expect(markdown).toContain("### Escenario bathroom (`bathroom`): **fail**");
    expect(markdown).toContain("| 1 | ok | 2 | 1.0 s | 3000 / 200 | searchTiles | Te propongo tres pisos \\| grises. ¿Cuál prefieres? |");
    expect(markdown).toContain(`| 2 | ok | 3 | 2.5 s | 9000 / 400 | getProduct (unknown_sku) → searchSupplies (rejected) → computeMaterials (needs_review) | ${"x".repeat(160)}… |`);
    expect(markdown).toContain("- T2 money-from-tools: montos que no salieron de una tool ni del cliente: 6000");
    expect(markdown).toContain("- quote:within: sin cotización");
    expect(markdown).toContain("### Escenario terrace (`terrace`): not run, call budget reached (100/110; this scenario can need 40)");
  });
});
