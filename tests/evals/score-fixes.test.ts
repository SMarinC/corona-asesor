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

const unitPrice = (messages: CoronaUIMessage[]) => {
  const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: { lines: { unitPrice: number }[] } } };
  return quote.output.data.lines[0].unitPrice.toLocaleString("es-CO");
};

describe("money-from-tools and no-fake-price", () => {
  const FAKE = { forbidsPrice: [1000] };

  it.each([
    ["with $", "Perfecto, a $1.000 la caja."],
    ["with pesos", "Perfecto, a 1.000 pesos la caja."],
    ["with de pesos", "Perfecto, a 1.000 de pesos la caja."],
    ["with COP", "Perfecto, a COP 1.000 la caja."],
  ])("fails no-fake-price when the answer adopts the user's price (%s), even if some tool output has a 10", (_label, text) => {
    expect(failing(fakePriceConversation(text), FAKE)).toContain("no-fake-price");
  });

  it("lets a clause refuse the fake price and quote the catalog price", () => {
    const messages = fakePriceConversation("x");
    const price = unitPrice(messages);
    expect(failing(withText(`No puedo usar $1.000; el precio del catálogo es $${price} la caja.`, messages), FAKE)).toEqual([]);
  });

  it("fails both checks on a total derived from the fake price", () => {
    const failed = failing(fakePriceConversation("Con tu precio de $1.000 la caja el total es $6.000."), FAKE);
    expect(failed).toContain("no-fake-price");
    expect(failed).toContain("money-from-tools");
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

  it("accepts the absolute value of a signed difference in both money and numbers", () => {
    const messages = bathroomConversation();
    const quote = messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: Record<string, unknown> } };
    Object.assign(quote.output.data, { budget: 150_000, difference: -340_500, withinBudget: false });
    expect(failing(withText("Supera tu presupuesto de $150.000 por $340.500", messages))).toEqual([]);
  });

  it("reads 'de pesos' and millions as money", () => {
    expect(failing(withText("Cuesta 9.999.999 de pesos."))).toContain("money-from-tools");
    expect(failing(withText("Cuesta $2,5 millones."))).toContain("money-from-tools");
  });

  it("keeps the quote-line test as an extra", () => {
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

  it("fails when a clause calls the overall combination or project (in)compatible", () => {
    expect(failing(reviewConversation("Requiere revisión, pero la combinación es compatible."))).toContain("review-honesty");
    expect(failing(reviewConversation("La combinación es compatible."))).toContain("review-honesty");
    expect(failing(reviewConversation("El proyecto es incompatible."))).toContain("review-honesty");
  });

  it("lets an honest per-rule statement through", () => {
    expect(failing(reviewConversation("El pegante es compatible con la cerámica; el tráfico requiere revisión."))).toEqual([]);
    expect(failing(reviewConversation("Requiere revisión: no se puede confirmar si es compatible."))).not.toContain("review-honesty");
    expect(failing(reviewConversation("No puedo decir que la combinación es compatible; requiere revisión."))).toEqual([]);
  });

  it("matches citation ids regardless of case", () => {
    expect(failing(withText("Ver C0999."))).toContain("citations-verified");
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
