import { describe, expect, it } from "vitest";
import { renderReport, scenarioPassed, summarize } from "@/evals/report";
import { scoreTurn } from "@/evals/score";
import { assistantMessage, bathroomConversation, userMessage } from "@/tests/fixtures/ui-messages";

describe("scoreTurn", () => {
  const log = { outcome: "ok", steps: 6, durationMs: 5_000, inputTokens: 30_000, outputTokens: 600 };

  it("passes a grounded answer", () => {
    const messages = bathroomConversation();
    const { checks } = scoreTurn({ messages, turnLog: log, error: null, expect: { must: ["computeMaterials", "buildQuote"], quote: "within" } });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("catches a money amount no tool or user produced and a step overrun", () => {
    const messages = bathroomConversation();
    messages[messages.length - 1] = assistantMessage([
      ...messages.at(-1)!.parts.filter((p) => p.type !== "text"),
      { type: "text", text: "Son 17 cajas a $45.000 cada una.", state: "done" },
    ]);
    const { checks } = scoreTurn({ messages, turnLog: { ...log, steps: 9 }, error: null, expect: {} });
    const failing = checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failing).toEqual(["steps", "money-from-tools"]);
  });

  it("catches a quantity computeMaterials never returned", () => {
    const messages = bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "G2", quantity: 3 }] });
    const { checks } = scoreTurn({ messages, turnLog: log, error: null, expect: {} });
    expect(checks.find((c) => c.name === "quantities-computed")).toMatchObject({ ok: false, detail: "G2:not_computed" });
  });

  it("fails a turn that ended in a stream error", () => {
    const { checks } = scoreTurn({ messages: bathroomConversation(), turnLog: null, error: "quota_exhausted", expect: {} });
    expect(checks.find((c) => c.name === "completed")).toMatchObject({ ok: false, detail: "quota_exhausted" });
  });
});

describe("scoreTurn asks", () => {
  const log = { outcome: "ok", steps: 1, durationMs: 1_000, inputTokens: 3_000, outputTokens: 150 };
  const asksCheck = (answer: string) =>
    scoreTurn({
      messages: [userMessage("Solo estima cuántas cajas necesito para mi cocina."), assistantMessage([{ type: "text", text: answer, state: "done" }])],
      turnLog: log,
      error: null,
      expect: { asks: true },
    }).checks.find((c) => c.name === "asks");

  it("accepts the baseline data request that has no question mark", () => {
    const answer = "Para poder darte el número exacto de cajas y el costo de los pisos para tu cocina, necesito que me compartas algunos datos.";
    expect(asksCheck(answer)?.ok).toBe(true);
  });

  it("accepts other ways of asking for data, with or without a question mark", () => {
    for (const answer of ["Compárteme las medidas del espacio.", "Indícame el ancho de junta.", "¿Podrías decirme las medidas", "¿Cuál es el largo?", "Cuál es el largo?"]) {
      expect(asksCheck(answer)?.ok, answer).toBe(true);
    }
  });

  it("still fails a statement that requests nothing", () => {
    for (const answer of ["Los pisos de cocina suelen ser de gres porcelánico.", "Estimé 20 cajas para tu cocina."]) {
      expect(asksCheck(answer)?.ok, answer).toBe(false);
    }
  });
});

describe("report", () => {
  it("summarizes and renders a run, marking scenarios that did not run", () => {
    const { checks, metrics } = scoreTurn({
      messages: bathroomConversation(),
      turnLog: { outcome: "ok", steps: 6, durationMs: 4_000, inputTokens: 24_000, outputTokens: 500 },
      error: null,
      expect: {},
    });
    const run = {
      date: "2026-10-05",
      model: "gemini-3.5-flash-lite",
      promptVersion: "test",
      results: [
        { id: "a", title: "Baño", mode: "semantic" as const, turns: [{ checks, metrics, keywordFallbacks: 0 }] },
        { id: "b", title: "Terraza", mode: "keyword" as const, turns: null, skippedReason: "call budget reached (100/110)" },
      ],
    };
    expect(scenarioPassed(run.results[0])).toBe(true);
    expect(summarize(run)).toMatchObject({ passed: 1, run: 1, total: 2, maxTurnAvgInputPerCall: 4_000, modelCalls: 6 });
    const markdown = renderReport(run);
    expect(markdown).toContain("| Scenarios passed | **1/2** (1 not run) |");
    expect(markdown).toContain("| Terraza | keyword | not run |");
  });
});
