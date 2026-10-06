import { describe, expect, it } from "vitest";
import { renderReport, scenarioPassed, summarize } from "@/evals/report";
import { scoreTurn } from "@/evals/score";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { bathroomConversation } from "@/tests/fixtures/ui-messages";

const turn = () => {
  const { checks, metrics } = scoreTurn({
    messages: bathroomConversation(),
    turnLog: { outcome: "ok", steps: 6, durationMs: 4_000, inputTokens: 24_000, outputTokens: 500 },
    error: null,
    catalog: makeToolDeps().catalog,
  });
  return { checks, metrics, keywordFallbacks: 0 };
};

describe("report", () => {
  it("summarizes and renders a run, marking scenarios that did not run", () => {
    const run = {
      date: "2026-10-05",
      model: "gemini-3.5-flash-lite",
      promptVersion: "test",
      calls: { used: 6, steps: 6, embeddings: 0 },
      results: [
        { id: "a", title: "Baño", mode: "semantic" as const, turns: [turn()], checks: [] },
        { id: "b", title: "Terraza", mode: "keyword" as const, turns: null, checks: [], skippedReason: "call budget reached (100/110)" },
      ],
    };
    expect(scenarioPassed(run.results[0])).toBe(true);
    expect(summarize(run)).toMatchObject({ passed: 1, run: 1, total: 2, modelCalls: 6 });
    const markdown = renderReport(run);
    expect(markdown).toContain("| Scenarios passed | **1/2** (1 not run) |");
    expect(markdown).toContain("| Terraza | keyword | not run |");
  });

  it("fails a scenario on a failing scenario check even when every turn passed", () => {
    const result = { id: "a", title: "Baño", mode: "semantic" as const, turns: [turn()], checks: [{ name: "quote:over", ok: false, detail: "withinBudget true" }] };
    expect(scenarioPassed(result)).toBe(false);
  });
});
