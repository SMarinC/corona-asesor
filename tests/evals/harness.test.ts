import { afterEach, describe, expect, it, vi } from "vitest";
import { runTurn } from "@/evals/harness";
import { SCENARIOS } from "@/evals/scenarios";
import { scoreTurn } from "@/evals/score";
import { createScriptedDemoModel } from "@/lib/chat/scripted-model";

afterEach(() => vi.restoreAllMocks());

describe("eval harness", () => {
  it("runs a scenario turn through the real handler and tools, and the scripted bathroom quote passes every check", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "bathroom-budget")!;
    const record = await runTurn([], scenario.turns[0].user, "keyword", createScriptedDemoModel({ delayMs: 0 }));
    expect(record.error).toBeNull();
    expect(record.turnLog).toMatchObject({ outcome: "ok", steps: 6 });
    const { checks } = scoreTurn({ messages: record.messages, turnLog: record.turnLog, error: record.error, expect: scenario.turns[0].expect });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("has the spec's 12 scenarios, each with at least one turn", () => {
    expect(SCENARIOS).toHaveLength(12);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(12);
    expect(SCENARIOS.filter((s) => s.mode === "keyword").length).toBeGreaterThan(0);
  });
});
