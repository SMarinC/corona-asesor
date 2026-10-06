import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/evals/scenarios";
import { scoreScenario, scoreTurn, type TurnInput } from "@/evals/score";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { QuoteData } from "@/lib/agent/tools/build-quote";
import type { CoronaPart } from "@/lib/ui/tool-parts";
import { assistantMessage, BATHROOM_PROMPT, bathroomConversation, errorPart, toolPart, userMessage } from "@/tests/fixtures/ui-messages";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const catalog = makeToolDeps().catalog;
const log = { outcome: "ok", steps: 6, durationMs: 5_000, inputTokens: 30_000, outputTokens: 600 };

const withText = (text: string, base = bathroomConversation()) => {
  base[base.length - 1] = assistantMessage([...base.at(-1)!.parts.filter((p) => p.type !== "text"), { type: "text", text, state: "done" }] as CoronaPart[]);
  return base;
};

const score = (messages: CoronaUIMessage[], over: Partial<TurnInput> = {}) => scoreTurn({ messages, turnLog: log, error: null, catalog, ...over });
const failing = (messages: CoronaUIMessage[], over: Partial<TurnInput> = {}) => score(messages, over).checks.filter((c) => !c.ok).map((c) => c.name);
const quoteOf = (messages: CoronaUIMessage[]) => (messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as unknown as { output: { data: QuoteData } }).output.data;

describe("scoreTurn", () => {
  it("runs the per-turn checks and passes the bathroom quote turn", () => {
    const { checks, metrics } = score(bathroomConversation());
    expect(checks.map((c) => c.name)).toEqual(["completed", "steps", "money-from-tools", "quantities-computed", "catalog-prices", "review"]);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(metrics).toMatchObject({ outcome: "ok", steps: 6, moneyNotFromTools: [], inventedQuantities: [] });
  });

  it("records the outcome: a step-capped turn still answered, a timeout and an error did not", () => {
    const capped = score(bathroomConversation(), { turnLog: { ...log, outcome: "step_cap", steps: 10 } });
    expect(capped.metrics.outcome).toBe("ok");
    expect(capped.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(["steps"]);
    const timeout = score(bathroomConversation(), { turnLog: { ...log, outcome: "timeout" }, error: "model_error" });
    expect(timeout.metrics.outcome).toBe("timeout");
    expect(timeout.checks.find((c) => c.name === "completed")).toMatchObject({ ok: false });
    const error = score(bathroomConversation(), { turnLog: null, error: "quota_exhausted" });
    expect(error.metrics.outcome).toBe("error");
    expect(error.checks.find((c) => c.name === "completed")).toMatchObject({ ok: false, detail: "quota_exhausted" });
  });

  it("fails a turn over 7 steps", () => {
    expect(failing(bathroomConversation(), { turnLog: { ...log, steps: 8 } })).toEqual(["steps"]);
  });

  it("catches a quantity computeMaterials never returned", () => {
    const { checks, metrics } = score(bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "G2", quantity: 3 }] }));
    expect(checks.find((c) => c.name === "quantities-computed")).toMatchObject({ ok: false, detail: "G2:not_computed" });
    expect(metrics.inventedQuantities).toEqual(["G2:not_computed"]);
  });

  it("checks every quote line's unit price against the catalog", () => {
    const messages = bathroomConversation();
    quoteOf(messages).lines[0].unitPrice = 1;
    expect(failing(messages)).toEqual(["catalog-prices"]);
    expect(score(messages).checks.find((c) => c.name === "catalog-prices")?.detail).toContain("T1");
  });

  it("asks for 'requiere revisión' when a tool needed review, by status or by verdict", () => {
    const byVerdict = bathroomConversation();
    (byVerdict.at(-1)!.parts.find((p) => p.type === "tool-checkCompatibility") as unknown as { output: { data: { verdict: string } } }).output.data.verdict = "needs_review";
    expect(failing(withText("Todo listo.", byVerdict))).toEqual(["review"]);
    expect(failing(withText("El tráfico Requiere Revisión.", byVerdict))).toEqual([]);
    const byStatus = bathroomConversation();
    Object.assign((byStatus.at(-1)!.parts.find((p) => p.type === "tool-computeMaterials") as unknown as { output: object }).output, { status: "needs_review", missing: [] });
    expect(failing(withText("Todo listo.", byStatus))).toEqual(["review"]);
  });
});

describe("money-from-tools", () => {
  it("fails an amount no tool returned and the customer never said, and reports it", () => {
    const { checks, metrics } = score(withText("El total es $6.000."));
    expect(checks.find((c) => c.name === "money-from-tools")?.ok).toBe(false);
    expect(metrics.moneyNotFromTools).toEqual([6000]);
  });

  it("passes the quote total written either way, the customer's budget and the absolute difference", () => {
    const messages = bathroomConversation();
    const total = quoteOf(messages).total.toLocaleString("es-CO");
    expect(failing(withText(`El total es $${total}, o sea ${total} pesos, dentro de tus 1.500.000 pesos.`, messages))).toEqual([]);
    const over = bathroomConversation();
    Object.assign(quoteOf(over), { budget: 150_000, difference: -340_500, withinBudget: false });
    expect(failing(withText("Supera tu presupuesto de $150.000 por $340.500", over))).toEqual([]);
  });

  it("lets the customer's own amount through but not a total derived from it", () => {
    const messages = withText("Me dices que la caja cuesta $1.000; con ese precio el total sería $6.000.");
    messages[0] = userMessage(`${BATHROOM_PROMPT} Sé que la caja cuesta $1.000.`);
    expect(score(messages).metrics.moneyNotFromTools).toEqual([6000]);
  });

  it("reads 'de pesos', COP and millions as money", () => {
    const messages = bathroomConversation();
    Object.assign(quoteOf(messages), { budget: 1_000_000 });
    expect(failing(withText("Tu presupuesto es de $1 millón.", messages))).toEqual([]);
    for (const answer of ["Cuesta $2 millones.", "Cuesta $2,5 millones.", "Cuesta 9.999.999 de pesos.", "Cuesta COP 7.777."]) {
      expect(failing(withText(answer)), answer).toEqual(["money-from-tools"]);
    }
  });
});

describe("asks", () => {
  const asking = (answer: string, parts: CoronaPart[] = []) => [
    userMessage("Solo estima cuántas cajas necesito para mi cocina."),
    assistantMessage([...parts, { type: "text", text: answer, state: "done" }] as CoronaPart[]),
  ];
  const asks = (messages: CoronaUIMessage[]) => score(messages, { asks: true, turnLog: { ...log, steps: 1 } }).checks.find((c) => c.name === "asks")!;

  it("passes a question or a data request, with list markers and unit labels", () => {
    for (const answer of [
      "¿Cuáles son las medidas del piso, en metros?",
      "Para darte el número exacto de cajas necesito que me compartas las medidas.",
      "Indícame el largo y el ancho.",
      "Me faltan datos:\n1. ¿Cuántos m2 mide?\n2. ¿Es zona húmeda?",
    ]) {
      expect(asks(asking(answer)).ok, answer).toBe(true);
    }
  });

  it("ignores markdown list markers (**1.**, 1., 1), - ) but not a real number inside an item", () => {
    const list = "Para cotizar necesito:\n**1.** ¿Cuál es el largo del piso?\n2. ¿Y el ancho?\n3) ¿Es zona húmeda?\n- **4.** ¿Tráfico bajo, medio o alto?\n- ¿Interior o exterior?";
    expect(asks(asking(list))).toMatchObject({ ok: true });
    expect(asks(asking("Para cotizar necesito:\n**1.** ¿Te sirven 20 cajas?"))).toMatchObject({ ok: false, detail: "escribió números: 20" });
  });

  it("allows a company question but no catalog tool", () => {
    const company = toolPart("getCompanyInfo", { section: "contacto" }, { status: "ok", data: {} });
    expect(asks(asking("¿Cuáles son las medidas?", [company])).ok).toBe(true);
    const search = toolPart("searchTiles", { surface: "floor" }, { status: "ok", data: { results: [], note: "" } });
    expect(asks(asking("¿Cuál prefieres?", [search]))).toMatchObject({ ok: false, detail: "llamó searchTiles" });
  });

  it("fails an answer that states a number or requests nothing", () => {
    expect(asks(asking("Serían unas 20 cajas, ¿te sirve?"))).toMatchObject({ ok: false, detail: "escribió números: 20" });
    expect(asks(asking("Para una cocina de 3 x 4 m, ¿qué color quieres?")).ok).toBe(false);
    expect(asks(asking("Los pisos de cocina suelen ser de gres porcelánico.")).ok).toBe(false);
  });
});

describe("scoreScenario", () => {
  /** The bathroom quote, then a closing turn without tools. */
  const conversation = () => [...bathroomConversation(), userMessage("Confirmo."), assistantMessage([{ type: "text", text: "Listo, queda confirmada.", state: "done" }])];
  const failingIn = (messages: CoronaUIMessage[], expect: Parameters<typeof scoreScenario>[1]) =>
    scoreScenario(messages, expect).filter((c) => !c.ok).map((c) => c.name);

  it("checks the tools, their inputs, the area and the budget verdict over the whole conversation", () => {
    const expected = {
      calls: ["searchTiles", "searchSupplies"] as const,
      inputs: {
        checkCompatibility: { surface: "floor", environment: "indoor", wetArea: true, traffic: "medium", jointWidthMm: 3 },
        computeMaterials: { jointWidthMm: 3 },
        buildQuote: { budget: 1_500_000 },
      },
      areaM2: 6,
      quote: "within" as const,
    };
    const checks = scoreScenario(conversation(), { ...expected, calls: [...expected.calls] });
    expect(checks.map((c) => c.name)).toEqual([
      "calls:searchTiles",
      "calls:searchSupplies",
      "input:checkCompatibility",
      "input:computeMaterials",
      "input:buildQuote",
      "area",
      "quote:within",
    ]);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(failingIn(conversation(), { calls: ["getProduct"], inputs: { checkCompatibility: { environment: "outdoor" } }, areaM2: 20, quote: "over" })).toEqual([
      "calls:getProduct",
      "input:checkCompatibility",
      "area",
      "quote:over",
    ]);
  });

  it("does not count a call that never finished or returned an error", () => {
    const messages = [
      userMessage("Cotiza."),
      assistantMessage([
        toolPart("buildQuote", { lines: [] }),
        toolPart("getProduct", { sku: "X" }, { status: "error", code: "unknown_sku", message: "no" }),
        errorPart("computeMaterials", { tileSku: "T1" }, "boom"),
      ]),
    ];
    expect(failingIn(messages, { calls: ["buildQuote", "getProduct", "computeMaterials"] })).toEqual(["calls:buildQuote", "calls:getProduct", "calls:computeMaterials"]);
  });

  it("reads the budget wording in the answer that presented the last quote, not in a later turn", () => {
    expect(failingIn(conversation(), { quoteMentions: ["Dentro del presupuesto"] })).toEqual([]);
    const later = [...bathroomConversation(), userMessage("¿Y?"), assistantMessage([{ type: "text", text: "Está fuera del presupuesto.", state: "done" }])];
    expect(failingIn(later, { quoteMentions: ["fuera del presupuesto"] })).toEqual(["quote-mentions"]);
  });

  it("accepts budget-too-low's three phrasings of an over-budget quote", () => {
    const { quoteMentions } = SCENARIOS.find((s) => s.id === "budget-too-low")!.expect;
    for (const answer of ["El total está fuera del presupuesto.", "El total supera tu presupuesto.", "La cotización excede tu presupuesto."]) {
      expect(failingIn(withText(answer), { quoteMentions }), answer).toEqual([]);
    }
    expect(failingIn(withText("El total está dentro de tu presupuesto."), { quoteMentions })).toEqual(["quote-mentions"]);
  });

  it("resolves a SKU when the last quote lists it and no call got unknown_sku", () => {
    expect(failingIn(conversation(), { resolvesSku: "T1" })).toEqual([]);
    expect(failingIn(conversation(), { resolvesSku: "T9" })).toEqual(["resolves:T9"]);
    const detour = conversation();
    detour[1] = assistantMessage([toolPart("getProduct", { sku: "T" }, { status: "error", code: "unknown_sku", message: "no" }), ...detour[1].parts]);
    expect(failingIn(detour, { resolvesSku: "T1" })).toEqual(["resolves:T1"]);
  });

  it("passes an out-of-catalog link only when no catalog tool ran", () => {
    const url = "https://corona.co/productos/sanitarios/c/sanitarios";
    const answer = (parts: CoronaPart[], text: string) => [userMessage("¿Qué sanitario me recomiendas?"), assistantMessage([...parts, { type: "text", text, state: "done" }] as CoronaPart[])];
    expect(failingIn(answer([], `No está en este asesor: [Sanitarios](${url})`), { link: url })).toEqual([]);
    expect(failingIn(answer([toolPart("getCompanyInfo", {}, { status: "ok", data: {} })], `Mira ${url}`), { link: url })).toEqual([]);
    expect(failingIn(answer([], "No está en este asesor."), { link: url })).toEqual(["link"]);
    const search = toolPart("searchTiles", {}, { status: "ok", data: { results: [], note: "" } });
    expect(failingIn(answer([search], `Mira ${url}`), { link: url })).toEqual(["link"]);
  });
});
