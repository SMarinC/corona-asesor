import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnRecord } from "@/evals/harness";
import { createPacer } from "@/evals/pacer";
import { scenarioPassed } from "@/evals/report";
import { runScenarios } from "@/evals/runner";
import type { Scenario } from "@/evals/scenarios";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { bathroomConversation } from "@/tests/fixtures/ui-messages";

afterEach(() => vi.useRealTimers());

const catalog = makeToolDeps().catalog;

const record = (over: Partial<TurnRecord> = {}): TurnRecord => ({
  messages: bathroomConversation(),
  turnLog: { outcome: "ok", steps: 6, durationMs: 1_000, inputTokens: 1_000, outputTokens: 100 },
  error: null,
  errorMessage: null,
  keywordFallbacks: 0,
  embedCalls: 0,
  ...over,
});

const twoTurn: Scenario = { id: "two", title: "Dos turnos", mode: "semantic", turns: [{ user: "uno" }, { user: "dos" }], expect: {} };
const oneTurn: Scenario = { id: "one", title: "Un turno", mode: "semantic", turns: [{ user: "uno" }], expect: {} };

describe("runScenarios", () => {
  it("skips a multi-turn scenario the budget cannot cover whole, instead of running half of it", async () => {
    const run = vi.fn(async () => record());
    const out = await runScenarios({ scenarios: [twoTurn], run, maxCalls: 15, catalog });
    expect(run).not.toHaveBeenCalled();
    expect(out.results[0]).toMatchObject({ turns: null, checks: [] });
    expect(out.results[0].skippedReason).toContain("call budget");
    expect(scenarioPassed(out.results[0])).toBe(false);
  });

  it("marks a scenario that stopped after turn 1 as failed with an incomplete check", async () => {
    const run = vi.fn(async () => record({ error: "quota_exhausted", turnLog: null }));
    const out = await runScenarios({ scenarios: [twoTurn, oneTurn], run, maxCalls: 110, catalog });
    expect(out.results[0].turns).toHaveLength(1);
    expect(scenarioPassed(out.results[0])).toBe(false);
    expect(out.results[0].checks).toEqual([expect.objectContaining({ name: "incomplete", ok: false })]);
    expect(out.results[1]).toMatchObject({ turns: null });
    expect(out.stopReason).toContain("quota_exhausted");
  });

  it.each([
    ["an error", "model_error"],
    ["a timeout", "timeout"],
  ])("stops a scenario after a turn that ends in %s: the rest are not sent nor charged, and the error is kept", async (_, outcome) => {
    const threeTurn: Scenario = { ...twoTurn, id: "three", turns: [{ user: "uno" }, { user: "dos" }, { user: "tres" }] };
    const failed = record({ error: "model_error", errorMessage: "Internal error encountered.", turnLog: { outcome, steps: 0, durationMs: 1, inputTokens: 0, outputTokens: 0 } });
    const run = vi.fn(async () => failed);
    const out = await runScenarios({ scenarios: [threeTurn, oneTurn], run, maxCalls: 110, catalog });
    // Turn 1 of the first scenario, then the next scenario still runs.
    expect(run).toHaveBeenCalledTimes(2);
    expect(out.stopReason).toBeNull();
    expect(out.callsUsed).toBe(6);
    const [stopped] = out.results;
    expect(stopped.notSent).toEqual([2, 3]);
    expect(stopped.turns).toEqual([expect.objectContaining({ error: "Internal error encountered." })]);
    expect(stopped.checks).toEqual([{ name: "incomplete", ok: false, detail: "1 de 3 turnos corrieron; no enviados: T2, T3" }]);
    expect(scenarioPassed(stopped)).toBe(false);
  });

  it("keeps no error on a turn that completed", async () => {
    const out = await runScenarios({ scenarios: [oneTurn], run: async () => record(), maxCalls: 110, catalog });
    expect(out.results[0].turns?.[0]).not.toHaveProperty("error");
    expect(out.results[0]).not.toHaveProperty("notSent");
  });

  it("scores the whole conversation once, after its last turn, and passes each turn's asks expectation", async () => {
    const scenario: Scenario = { ...twoTurn, turns: [{ user: "uno", asks: true }, { user: "dos" }], expect: { calls: ["buildQuote"], quote: "over" } };
    const out = await runScenarios({ scenarios: [scenario], run: async () => record(), maxCalls: 110, catalog });
    const [result] = out.results;
    expect(result.turns?.[0].checks.map((c) => c.name)).toContain("asks");
    expect(result.turns?.[1].checks.map((c) => c.name)).not.toContain("asks");
    expect(result.checks).toEqual([expect.objectContaining({ name: "calls:buildQuote", ok: true }), expect.objectContaining({ name: "quote:over", ok: false })]);
    expect(scenarioPassed(result)).toBe(false);
  });

  it("counts real calls, including a failed call and its retry, plus embeddings", async () => {
    const out = await runScenarios({ scenarios: [oneTurn, oneTurn], run: async () => record({ embedCalls: 2 }), maxCalls: 110, catalog });
    expect(out).toMatchObject({ callsUsed: 12, stepsSummed: 12, embeddingCalls: 4 });
    const failed = await runScenarios({
      scenarios: [oneTurn],
      run: async () => record({ error: "network", turnLog: { outcome: "error", steps: 1, durationMs: 1, inputTokens: 0, outputTokens: 0 } }),
      maxCalls: 110,
      catalog,
    });
    expect(failed.callsUsed).toBe(3);
  });
});

describe("pacer", () => {
  it("waits on a sliding 60 s window until calls in the window plus a worst-case turn fit the rpm", async () => {
    vi.useFakeTimers();
    const pacer = createPacer({ rpm: 15, worstCase: 10 });
    await pacer.waitForTurn(); // empty window: no wait
    pacer.record(6); // 6 + 10 > 15
    let released = false;
    const waiting = pacer.waitForTurn().then(() => {
      released = true;
    });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await waiting;
    expect(released).toBe(true);
  });

  it("does not wait when the window already has room", async () => {
    vi.useFakeTimers();
    const pacer = createPacer({ rpm: 15, worstCase: 10 });
    pacer.record(5);
    await pacer.waitForTurn();
  });
});

describe("exitCodeFor", () => {
  it("is 0 for a complete run and 2 for an early stop", async () => {
    const { exitCodeFor } = await import("@/evals/runner");
    expect(exitCodeFor(null)).toBe(0);
    expect(exitCodeFor("call budget reached (100/110; x)")).toBe(2);
  });
});
