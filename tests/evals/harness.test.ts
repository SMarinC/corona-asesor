import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runTurn, type TurnRecord } from "@/evals/harness";
import { SCENARIOS, type TurnExpect } from "@/evals/scenarios";
import { scoreTurn } from "@/evals/score";
import { createScriptedDemoModel, DEMO_SKUS } from "@/lib/chat/scripted-model";
import { scriptedModel, textTurn, toolTurn } from "@/tests/helpers/mock-model";

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

/** Step 0 searches the technical sheets, step 1 answers. */
function sheetSearchModel() {
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const lastUser = options.prompt.findLastIndex((m) => m.role === "user");
      const searched = options.prompt.slice(lastUser + 1).some((m) => m.role === "assistant");
      const chunks = searched
        ? [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Listo." },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: "STOP" }, usage },
          ]
        : [
            { type: "stream-start", warnings: [] },
            { type: "tool-call", toolCallId: "s1", toolName: "searchTechnicalSheets", input: JSON.stringify({ query: "rendimiento de la boquilla" }) },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "STOP" }, usage },
          ];
      return { stream: simulateReadableStream({ chunks: chunks as never[], initialDelayInMs: 0, chunkDelayInMs: 0 }) };
    },
  });
}

describe("eval harness", () => {
  it("runs turns through the real handler and tools, and every turn of the staged scripted quote passes its checks", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "bathroom-budget")!;
    const model = createScriptedDemoModel({ delayMs: 0 });
    // The one-shot scenario's expectations, split across the stages that now produce them.
    const { quote, areaM2, toolInput } = scenario.turns[0].expect;
    const turns: { user: string; expect: TurnExpect; steps: number }[] = [
      { user: scenario.turns[0].user, expect: { must: ["searchTiles"], quote: "none", asks: true }, steps: 2 },
      {
        user: "Me quedo con el Piso Soria Gris.",
        expect: { must: ["searchSupplies", "checkCompatibility"], quote: "none", asks: true, toolInput: { checkCompatibility: toolInput!.checkCompatibility } },
        steps: 3,
      },
      { user: "Sí, los confirmo.", expect: { must: ["computeMaterials", "buildQuote"], quote, areaM2, asks: true, toolInput: { buildQuote: toolInput!.buildQuote } }, steps: 3 },
    ];
    let history: TurnRecord["messages"] = [];
    for (const turn of turns) {
      const record = await runTurn(history, turn.user, "keyword", model);
      expect(record.error).toBeNull();
      expect(record.turnLog).toMatchObject({ outcome: "ok", steps: turn.steps });
      const { checks } = scoreTurn({ messages: record.messages, turnLog: record.turnLog, error: record.error, expect: turn.expect });
      expect(checks.filter((c) => !c.ok), turn.user).toEqual([]);
      history = record.messages;
    }
  });

  it("falls back to keyword search when the query embedder fails, and counts the fallback", async () => {
    const record = await runTurn([], "Dime el rendimiento de la boquilla", "keyword", sheetSearchModel());
    expect(record.error).toBeNull();
    expect(record.keywordFallbacks).toBe(1);
    expect(record.embedCalls).toBe(0);
    const search = record.messages.at(-1)!.parts.find((p) => p.type === "tool-searchTechnicalSheets") as { output?: { data?: { mode?: string } } };
    expect(search.output?.data?.mode).toBe("keyword");
  });

  it("offline forces the keyword path even in semantic mode, so scripted runs cannot reach the network", async () => {
    const record = await runTurn([], "Dime el rendimiento de la boquilla", "semantic", sheetSearchModel(), { offline: true });
    expect(record.keywordFallbacks).toBe(1);
    expect(record.embedCalls).toBe(0);
  });

  it("has the spec's 12 scenarios, each with at least one turn", () => {
    expect(SCENARIOS).toHaveLength(12);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(12);
    expect(SCENARIOS.filter((s) => s.mode === "keyword").length).toBeGreaterThan(0);
  });
});

describe("eval harness quantity guard", () => {
  it("hands the tools the conversation's ledger, so an invented quantity comes back needs_review", async () => {
    const model = scriptedModel([toolTurn([{ toolName: "buildQuote", input: { lines: [{ sku: DEMO_SKUS.tile, quantity: 99 }] } }]), textTurn("Listo.")]);
    const record = await runTurn([], "Cotiza 99 cajas", "keyword", model);
    expect(record.error).toBeNull();
    const quote = record.messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as { output?: { status: string; missing?: { field: string }[] } };
    expect(quote.output?.status).toBe("needs_review");
    expect(quote.output?.missing?.map((m) => m.field)).toContain(`quantity:${DEMO_SKUS.tile}`);
  });
});
