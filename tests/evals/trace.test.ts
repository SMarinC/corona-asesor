import { describe, expect, it } from "vitest";
import { answerOf, traceOf } from "@/evals/trace";
import { runScenarios } from "@/evals/runner";
import type { Scenario } from "@/evals/scenarios";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { assistantMessage, bathroomConversation, errorPart, toolPart } from "@/tests/fixtures/ui-messages";

describe("traceOf and answerOf", () => {
  const assistant = bathroomConversation().at(-1)!;

  it("returns the final answer text of the turn", () => {
    expect(answerOf(assistant)).toBe("El pegante sirve para cerámica [c0001] y la boquilla cubre juntas de 1 a 5 mm [c0002]. Total dentro del presupuesto.");
  });

  it("lists every tool call in order with its status and key inputs", () => {
    const trace = traceOf(assistant);
    expect(trace.map((s) => s.tool)).toEqual(["searchTiles", "searchSupplies", "searchSupplies", "computeMaterials", "checkCompatibility", "buildQuote"]);
    expect(trace[0]).toEqual({ tool: "searchTiles", status: "ok", input: { surface: "floor", environment: "indoor", wetArea: true } });
    expect(trace[3].input).toMatchObject({ tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", lengthM: 3, widthM: 2 });
    expect(trace[4].input).toMatchObject({ traffic: "medium", environment: "indoor" });
    expect(trace[5].input).toMatchObject({ budget: 1_500_000, lines: [{ sku: "T1" }, { sku: "A1" }, { sku: "G1" }] });
  });

  it("records the status of a needs_review, a tool error and an SDK error, and the error code", () => {
    const message = assistantMessage([
      toolPart("getProduct", { sku: "X" }, { status: "error", code: "unknown_sku", message: "no" }),
      toolPart("computeMaterials", { tileSku: "T2" }, { status: "needs_review", data: {}, missing: [] }),
      errorPart("buildQuote", { lines: [] }, "boom"),
      toolPart("searchTiles", { surface: "wall" }),
    ]);
    expect(traceOf(message)).toEqual([
      { tool: "getProduct", status: "error", error: "unknown_sku", input: { sku: "X" } },
      { tool: "computeMaterials", status: "needs_review", input: { tileSku: "T2" } },
      { tool: "buildQuote", status: "error", input: { lines: [] } },
      { tool: "searchTiles", status: "running", input: { surface: "wall" } },
    ]);
  });

  it("marks a truncated array so an auditor can tell", () => {
    const lines = Array.from({ length: 15 }, (_, i) => ({ sku: `S${i}`, quantity: 1 }));
    const input = traceOf(assistantMessage([toolPart("buildQuote", { lines }, { status: "ok", data: {} })]))[0].input as { lines: unknown[] };
    expect(input.lines).toHaveLength(13);
    expect(input.lines.at(-1)).toBe("…");
  });

  it("keeps the trace compact and free of IP addresses", () => {
    const message = assistantMessage([
      toolPart("searchTechnicalSheets", { query: `${"x".repeat(500)} desde 203.0.113.7`, sku: "S" }, { status: "ok", data: {} }),
    ]);
    const input = traceOf(message)[0].input as { query: string };
    expect(input.query.length).toBeLessThanOrEqual(121);
    expect(JSON.stringify(traceOf(assistantMessage([toolPart("searchTechnicalSheets", { query: "desde 203.0.113.7" }, { status: "ok", data: {} })])))).not.toContain("203.0.113.7");
  });
});

describe("runScenarios keeps the answer and the trace", () => {
  it("persists them on every turn result", async () => {
    const scenario: Scenario = { id: "one", title: "Un turno", mode: "semantic", turns: [{ user: "uno" }], expect: {} };
    const out = await runScenarios({
      scenarios: [scenario],
      run: async () => ({ messages: bathroomConversation(), turnLog: { outcome: "ok", steps: 6, durationMs: 1, inputTokens: 1, outputTokens: 1 }, error: null, keywordFallbacks: 0, embedCalls: 0 }),
      maxCalls: 110,
      catalog: makeToolDeps().catalog,
    });
    const turn = out.results[0].turns![0];
    expect(turn.answer).toContain("[c0001]");
    expect(turn.trace?.map((s) => s.tool)).toContain("buildQuote");
    expect(JSON.parse(JSON.stringify(turn)).trace).toHaveLength(6);
  });
});
