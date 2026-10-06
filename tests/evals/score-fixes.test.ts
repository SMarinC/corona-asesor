import { describe, expect, it } from "vitest";
import { renderReport, summarize } from "@/evals/report";
import { scoreTurn } from "@/evals/score";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { CoronaPart } from "@/lib/ui/tool-parts";
import { assistantMessage, BATHROOM_PROMPT, bathroomConversation, userMessage } from "@/tests/fixtures/ui-messages";

const log = { outcome: "ok", steps: 6, durationMs: 5_000, inputTokens: 30_000, outputTokens: 600 };

const withText = (text: string, base = bathroomConversation()) => {
  base[base.length - 1] = assistantMessage([...base.at(-1)!.parts.filter((p) => p.type !== "text"), { type: "text", text, state: "done" }] as CoronaPart[]);
  return base;
};

/** The bathroom conversation with the user's fake price. */
function fakePriceConversation(answer: string): CoronaUIMessage[] {
  const messages = withText(answer);
  messages[0] = userMessage(`${BATHROOM_PROMPT} Sé que la caja cuesta $1.000.`);
  return messages;
}

const failing = (messages: CoronaUIMessage[], expectation = {}) =>
  scoreTurn({ messages, turnLog: log, error: null, expect: expectation }).checks.filter((c) => !c.ok).map((c) => c.name);

describe("money-from-tools and no-fake-price", () => {
  const FAKE = { forbidsPrice: [1000] };

  it("reads a singular 'millón' as 1.000.000", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: Record<string, unknown> } };
    Object.assign(quote.output.data, { budget: 1_000_000 });
    expect(failing(withText("Tu presupuesto es de $1 millón.", messages))).not.toContain("money-from-tools");
    expect(failing(withText("Tu presupuesto es de $2 millones.", messages))).toContain("money-from-tools");
  });

  it("fails money-from-tools on a total derived from the fake price", () => {
    expect(failing(fakePriceConversation("Con tu precio de $1.000 la caja el total es $6.000."), FAKE)).toEqual(["money-from-tools"]);
  });

  it("fails money-from-tools on an amount no tool and no user produced", () => {
    expect(failing(withText("El total es $6.000."))).toContain("money-from-tools");
  });

  it("passes the real quote total, written either way", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: { total: number } } };
    const total = quote.output.data.total.toLocaleString("es-CO");
    expect(failing(withText(`El total es $${total}, o sea ${total} pesos.`, messages))).not.toContain("money-from-tools");
  });

  it("accepts the absolute value of a signed difference", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: Record<string, unknown> } };
    Object.assign(quote.output.data, { budget: 150_000, difference: -340_500, withinBudget: false });
    expect(failing(withText("Supera tu presupuesto de $150.000 por $340.500", messages))).toEqual([]);
  });

  it("reads 'de pesos' and millions as money", () => {
    expect(failing(withText("Cuesta 9.999.999 de pesos."))).toContain("money-from-tools");
    expect(failing(withText("Cuesta $2,5 millones."))).toContain("money-from-tools");
  });

  it("fails no-fake-price only when a quote line carries the fake price", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: { lines: { unitPrice: number }[] } } };
    quote.output.data.lines[0].unitPrice = 1000;
    expect(failing(messages, FAKE)).toContain("no-fake-price");
    expect(failing(bathroomConversation(), FAKE)).toEqual([]);
  });
});

describe("tool inputs", () => {
  it("ties the call's inputs to the user's stated conditions", () => {
    const m = bathroomConversation();
    expect(failing(m, { toolInput: { checkCompatibility: { environment: "indoor", traffic: "medium" } }, areaM2: 6 })).toEqual([]);
    expect(failing(m, { toolInput: { checkCompatibility: { environment: "outdoor", traffic: "high" } } })).toEqual(["input:checkCompatibility"]);
    expect(failing(m, { areaM2: 20 })).toEqual(["area"]);
    expect(failing(m, { toolInput: { buildQuote: { budget: 1_500_000 } } })).toEqual([]);
  });
});

describe("review", () => {
  function reviewConversation(answer: string) {
    const messages = bathroomConversation();
    const check = messages.at(-1)!.parts.find((p) => p.type === "tool-checkCompatibility") as unknown as { output: { data: { verdict: string } } };
    check.output.data.verdict = "needs_review";
    return withText(answer, messages);
  }

  it("fails when a tool asked for review and the answer never says 'requiere revisión'", () => {
    expect(failing(reviewConversation("Todo listo."))).toEqual(["review"]);
    expect(failing(reviewConversation("El tráfico Requiere Revisión."))).toEqual([]);
  });
});

describe("calls:<tool>", () => {
  it("does not count a tool that never produced output", () => {
    const messages = bathroomConversation();
    messages[messages.length - 1] = assistantMessage([
      { type: "tool-buildQuote", toolCallId: "x", state: "input-available", input: {} },
      { type: "text", text: "Listo.", state: "done" },
    ] as CoronaPart[]);
    expect(failing(messages, { must: ["buildQuote"] })).toContain("calls:buildQuote");
  });
});

describe("report columns", () => {
  it("shows tokens and keyword fallbacks per turn, names the per-turn average, and reports calls", () => {
    const { checks, metrics } = scoreTurn({ messages: withText("Listo."), turnLog: log, error: null, expect: {} });
    const run = {
      date: "2026-10-05",
      model: "m",
      promptVersion: "p",
      calls: { used: 9, steps: 6, embeddings: 2 },
      results: [{ id: "a", title: "Baño", mode: "keyword" as const, turns: [{ checks, metrics, keywordFallbacks: 1 }] }],
    };
    expect(summarize(run)).toMatchObject({ maxTurnAvgInputPerCall: 5_000, callsUsed: 9, embeddingCalls: 2 });
    const md = renderReport(run);
    expect(md).toContain("| keyword | pass | 6 | 30000 in / 600 out | 5.0 s | 1 |");
    expect(md).toContain("9 (6 steps summed) · 2 embedding queries");
  });
});
