import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runTurn } from "@/evals/harness";
import { SCENARIOS } from "@/evals/scenarios";
import { scoreTurn } from "@/evals/score";
import { createScriptedDemoModel } from "@/lib/chat/scripted-model";

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
  it("runs a scenario turn through the real handler and tools, and the scripted bathroom quote passes every check", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "bathroom-budget")!;
    const record = await runTurn([], scenario.turns[0].user, "keyword", createScriptedDemoModel({ delayMs: 0 }));
    expect(record.error).toBeNull();
    expect(record.turnLog).toMatchObject({ outcome: "ok", steps: 6 });
    const { checks } = scoreTurn({ messages: record.messages, turnLog: record.turnLog, error: record.error, expect: scenario.turns[0].expect });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
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
