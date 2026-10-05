import { describe, expect, it } from "vitest";
import { renderReport, scenarioPassed, summarize } from "@/evals/report";
import { allowedNumbers, extractNumbers, scoreTurn } from "@/evals/score";
import { assistantMessage, BATHROOM_PROMPT, bathroomConversation, userMessage } from "@/tests/fixtures/ui-messages";

describe("extractNumbers", () => {
  it("reads Spanish thousands, decimals and percents, and skips labels", () => {
    expect(extractNumbers("Total $1.500.000, área 6,6 m² con 10 % de desperdicio y 55,2 × 55,2 cm.")).toEqual([1_500_000, 6.6, 10, 55.2, 55.2]);
    expect(extractNumbers("1. Pegante [c0046] en kg/m2, formato 60x120, ver https://corona.co/p/123 y [la ficha](https://x.co/9).")).toEqual([]);
  });
});

describe("allowedNumbers", () => {
  it("accepts tool values, their percent and centimetre forms, numbers inside tool strings, and the user's numbers", () => {
    const allowed = allowedNumbers([{ wastePct: 0.1, formatMm: { length: 552 }, name: "Junta de 1 a 5 mm", m2PerBox: 1.4444 }], ["Mide 3 x 2 m"]);
    for (const n of [10, 55.2, 1, 5, 1.44, 3, 2]) expect(allowed.has(n)).toBe(true);
    expect(allowed.has(7)).toBe(false);
  });
});

describe("scoreTurn", () => {
  const log = { outcome: "ok", steps: 6, durationMs: 5_000, inputTokens: 30_000, outputTokens: 600 };

  it("passes a grounded answer", () => {
    const messages = bathroomConversation();
    const { checks, metrics } = scoreTurn({ messages, turnLog: log, error: null, expect: { must: ["computeMaterials", "buildQuote"], quote: "within" } });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(metrics.citedIds).toEqual(["c0001", "c0002"]);
  });

  it("catches an invented number, a money amount that only the user said, an unverified citation and a step overrun", () => {
    const messages = bathroomConversation();
    // The user claims a price; repeating it is grounded in the user's words but still not a catalog price.
    messages[0] = userMessage(`${BATHROOM_PROMPT} Me dijeron que la caja cuesta $45.000.`);
    messages[messages.length - 1] = assistantMessage([
      ...messages.at(-1)!.parts.filter((p) => p.type !== "text"),
      { type: "text", text: "Son 17 cajas a $45.000 cada una [c0999].", state: "done" },
    ]);
    const { checks } = scoreTurn({ messages, turnLog: { ...log, steps: 9 }, error: null, expect: {} });
    const failing = checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failing).toEqual(["steps", "grounded-numbers", "money-from-tools", "citations-verified"]);
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
    expect(summarize(run)).toMatchObject({ passed: 1, run: 1, total: 2, maxInputTokensPerCall: 4_000, modelCalls: 6 });
    const markdown = renderReport(run);
    expect(markdown).toContain("| Scenarios passed | **1/2** (1 not run) |");
    expect(markdown).toContain("| Terraza | keyword | not run |");
  });
});
