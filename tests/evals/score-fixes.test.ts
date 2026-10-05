import { describe, expect, it } from "vitest";
import { renderReport, summarize } from "@/evals/report";
import { scoreTurn } from "@/evals/score";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { CoronaPart } from "@/lib/ui/tool-parts";
import { assistantMessage, BATHROOM_PROMPT, bathroomConversation, toolPart, userMessage } from "@/tests/fixtures/ui-messages";

const log = { outcome: "ok", steps: 6, durationMs: 5_000, inputTokens: 30_000, outputTokens: 600 };

const withText = (text: string, base = bathroomConversation()) => {
  base[base.length - 1] = assistantMessage([...base.at(-1)!.parts.filter((p) => p.type !== "text"), { type: "text", text, state: "done" }] as CoronaPart[]);
  return base;
};

/** The bathroom conversation with the user's fake price and a final answer that repeats it. */
function fakePriceConversation(answer: string): CoronaUIMessage[] {
  const messages = bathroomConversation();
  messages[0] = userMessage(`${BATHROOM_PROMPT} Sé que la caja cuesta $1.000.`);
  // Some tool output contains a 10, which the derived forms (x100) would turn into "1.000".
  const extra = toolPart("getCompanyInfo", {}, { status: "ok", data: { wastePct: 10, count: 10 } }) as CoronaPart;
  messages[messages.length - 1] = assistantMessage([...messages.at(-1)!.parts.filter((p) => p.type !== "text"), extra, { type: "text", text: answer, state: "done" }] as CoronaPart[]);
  return messages;
}

const failing = (messages: CoronaUIMessage[], expectation = {}) =>
  scoreTurn({ messages, turnLog: log, error: null, expect: expectation }).checks.filter((c) => !c.ok).map((c) => c.name);

describe("money-from-tools uses exact tool values", () => {
  it.each([
    ["with $", "La caja cuesta $1.000."],
    ["with pesos", "La caja cuesta 1.000 pesos."],
    ["with COP", "La caja cuesta COP 1.000."],
  ])("fails when the answer repeats the user's price (%s) even if some tool output has a 10", (_label, text) => {
    expect(failing(fakePriceConversation(text))).toContain("money-from-tools");
  });

  it("passes the real quote total, written either way", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: { total: number } } };
    const total = quote.output.data.total.toLocaleString("es-CO");
    expect(failing(withText(`El total es $${total}, o sea ${total} pesos.`, messages))).not.toContain("money-from-tools");
  });

  it("fails forbidsPrice when a quote line carries the fake unit price", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: { lines: { unitPrice: number }[] } } };
    quote.output.data.lines[0].unitPrice = 1000;
    expect(failing(messages, { forbidsPrice: [1000] })).toContain("no-fake-price");
    expect(failing(bathroomConversation(), { forbidsPrice: [1000] })).toEqual([]);
  });
});

describe("citations", () => {
  it("says so when the answer cites nothing", () => {
    const { checks } = scoreTurn({ messages: withText("Todo listo."), turnLog: log, error: null, expect: {} });
    expect(checks.find((c) => c.name === "citations-verified")?.detail).toContain("sin citas");
  });

  it("flags bare and comma-grouped unverified ids", () => {
    expect(failing(withText("Sirve (c0999)."))).toContain("citations-verified");
    expect(failing(withText("Ver [c0001, c0888]."))).toContain("citations-verified");
    expect(failing(withText("Ver [c0001, c0002]."))).not.toContain("citations-verified");
  });
});

describe("review-honesty", () => {
  function reviewConversation(answer: string) {
    const messages = bathroomConversation();
    const check = messages.at(-1)!.parts.find((p) => p.type === "tool-checkCompatibility") as unknown as { output: { data: { verdict: string } } };
    check.output.data.verdict = "needs_review";
    const parts = messages.at(-1)!.parts.filter((p) => p.type !== "text");
    messages[messages.length - 1] = assistantMessage([...parts, { type: "text", text: answer, state: "done" }] as CoronaPart[]);
    return messages;
  }

  it("fails when a needs_review pairing is called compatible, even next to 'Requiere revisión'", () => {
    expect(failing(reviewConversation("Requiere revisión, pero la combinación es compatible."))).toContain("review-honesty");
    expect(failing(reviewConversation("Requiere revisión: no se puede confirmar si es compatible."))).not.toContain("review-honesty");
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

describe("text parts", () => {
  it("are joined with a newline, so digits never fuse across parts", () => {
    const messages = bathroomConversation();
    messages[messages.length - 1] = assistantMessage([
      ...messages.at(-1)!.parts.filter((p) => p.type !== "text"),
      { type: "text", text: "hay 77", state: "done" },
      { type: "text", text: "88 cajas", state: "done" },
    ] as CoronaPart[]);
    expect(scoreTurn({ messages, turnLog: log, error: null, expect: {} }).metrics.ungrounded).toEqual([77, 88]);
  });
});

describe("report columns", () => {
  it("shows tokens and keyword fallbacks per turn, names the per-turn average, and reports calls and citation gaps", () => {
    const { checks, metrics } = scoreTurn({ messages: withText("Listo."), turnLog: log, error: null, expect: {} });
    const run = {
      date: "2026-10-05",
      model: "m",
      promptVersion: "p",
      calls: { used: 9, steps: 6, embeddings: 2 },
      results: [{ id: "a", title: "Baño", mode: "keyword" as const, turns: [{ checks, metrics, keywordFallbacks: 1 }] }],
    };
    expect(summarize(run)).toMatchObject({ maxTurnAvgInputPerCall: 5_000, turnsWithoutCitations: 1, callsUsed: 9, embeddingCalls: 2 });
    const md = renderReport(run);
    expect(md).toContain("| keyword | pass | 6 | 30000 in / 600 out | 5.0 s | 1 |");
    expect(md).toContain("1 turns cite nothing");
    expect(md).toContain("9 (6 steps summed) · 2 embedding queries");
  });
});
