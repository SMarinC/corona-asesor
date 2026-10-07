import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toBlocks } from "@/components/chat/message";
import { runTurn } from "@/evals/harness";
import { scenarioPassed } from "@/evals/report";
import { runScenarios } from "@/evals/runner";
import { SCENARIOS } from "@/evals/scenarios";
import { traceOf } from "@/evals/trace";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { TOOL_UNAVAILABLE } from "@/lib/agent/stage";
import { createScriptedDemoModel, DEMO_SKUS } from "@/lib/chat/scripted-model";
import { getCatalog } from "@/lib/data/catalog";
import { buildTrace } from "@/lib/ui/trace";
import { bathroomConversation } from "@/tests/fixtures/ui-messages";
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
  it("the scripted model drives bathroom-budget end to end through the real handler and tools, and it passes", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "bathroom-budget")!;
    const model = createScriptedDemoModel({ delayMs: 0 });
    const out = await runScenarios({
      scenarios: [scenario],
      run: (history, text, mode) => runTurn(history, text, mode, model, { offline: true }),
      maxCalls: 110,
      catalog: getCatalog(),
    });
    const [result] = out.results;
    const failing = [...result.turns!.flatMap((t) => t.checks), ...result.checks].filter((c) => !c.ok);
    expect(failing).toEqual([]);
    expect(scenarioPassed(result)).toBe(true);
    // Stage by stage: tiles, then adhesive and grout, then the quote, then the closing.
    expect(result.turns!.map((t) => t.trace!.map((s) => s.tool))).toEqual([
      ["searchTiles"],
      ["searchSupplies", "searchSupplies", "checkCompatibility"],
      ["computeMaterials", "buildQuote"],
      [],
    ]);
    expect(out).toMatchObject({ callsUsed: 9, stopReason: null });
    // Each turn gets its stage's prompt; turn 4 ("Confirmo.") comes after the quote, so it gets the quoted step.
    const prompts = [...new Set(model.doStreamCalls.map((call) => call.prompt[0].content))];
    expect(prompts).toEqual((["explore", "supplies", "quote", "quoted"] as const).map(buildSystemPrompt));
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
});

describe("eval harness errors", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a failed turn's message from its chat_turn line, with secrets redacted", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "fake-eval-key-for-test");
    // Built at runtime, so no key-shaped literal sits in the repository for secret scanners.
    const keyShaped = `AIza${"x".repeat(35)}`;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: `Internal error for fake-eval-key-for-test, ${keyShaped}, key=abc123 from 203.0.113.7`,
          url: "https://x",
          requestBodyValues: {},
          statusCode: 500,
          isRetryable: false,
        });
      },
    });
    const record = await runTurn([], "Hola", "keyword", model, { offline: true });
    expect(record.error).toBe("model_error");
    expect(record.errorMessage).toBe("Internal error for [redacted], [redacted], [redacted] from [redacted]");
  });

  it("has no error message when the turn completed", async () => {
    const record = await runTurn([], "Hola", "keyword", scriptedModel([textTurn("Hola, ¿qué espacio quieres renovar?")]), { offline: true });
    expect(record.errorMessage).toBeNull();
  });
});

describe("eval harness gate rejections", () => {
  it("traces a call to a tool outside the step as rejected, and the chat shows no card and no trace step for it", async () => {
    const model = scriptedModel([
      toolTurn([{ toolName: "computeMaterials", input: { lengthM: 3, widthM: 2, tileSku: DEMO_SKUS.tile } }]),
      textTurn("Primero elijamos el piso: ¿cuál prefieres?"),
    ]);
    // First turn, so the explore stage: computeMaterials is not active.
    const record = await runTurn([], "Piso para un baño de 3 x 2 m", "keyword", model, { offline: true });
    expect(record.error).toBeNull();
    expect(record.turnLog?.outcome).toBe("ok");
    const assistant = record.messages.at(-1)!;
    expect(assistant.parts.find((p) => p.type === "tool-computeMaterials")).toMatchObject({ state: "output-error", errorText: TOOL_UNAVAILABLE });
    expect(traceOf(assistant)).toEqual([{ tool: "computeMaterials", status: "rejected", input: { lengthM: 3, widthM: 2, tileSku: DEMO_SKUS.tile } }]);
    expect(toBlocks(assistant)).toEqual([{ kind: "text", text: "Primero elijamos el piso: ¿cuál prefieres?" }]);
    expect(buildTrace(assistant, undefined).flatMap((step) => step.tools)).toEqual([]);
  });
});

describe("eval harness quantity guard", () => {
  it("hands the tools the conversation's ledger, so an invented quantity comes back needs_review", async () => {
    const model = scriptedModel([toolTurn([{ toolName: "buildQuote", input: { lines: [{ sku: DEMO_SKUS.tile, quantity: 99 }] } }]), textTurn("Listo.")]);
    // A conversation already at the quote stage: the stage gate lets buildQuote run only there.
    const record = await runTurn(bathroomConversation(), "Cotiza 99 cajas", "keyword", model);
    expect(record.error).toBeNull();
    const quote = record.messages.at(-1)!.parts.find((p) => p.type === "tool-buildQuote") as { output?: { status: string; missing?: { field: string }[] } };
    expect(quote.output?.status).toBe("needs_review");
    expect(quote.output?.missing?.map((m) => m.field)).toContain(`quantity:${DEMO_SKUS.tile}`);
  });
});
