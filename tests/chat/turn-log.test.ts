import { describe, expect, it, vi } from "vitest";
import { createTurnLogger } from "@/lib/chat/turn-log";

describe("createTurnLogger", () => {
  it("emits one chat_turn line with steps, tools, latency and usage", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    let now = 1_000;
    const turn = createTurnLogger({ requestId: "r1", ipHash: "abc" }, () => now);
    turn.hooks.onTool({ tool: "searchTiles", ms: 12, status: "ok" });
    turn.hooks.onStep({ step: 0, ms: 800, toolCalls: ["searchTiles"], finishReason: "tool-calls" });
    turn.hooks.onStep({ step: 1, ms: 600, toolCalls: [], finishReason: "stop" });
    now = 2_500;
    turn.hooks.onFinish({ steps: 2, finishReason: "stop", inputTokens: 900, outputTokens: 120, hitStepCap: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(spy.mock.calls[0][0]))).toMatchObject({
      level: "info",
      event: "chat_turn",
      requestId: "r1",
      ipHash: "abc",
      outcome: "ok",
      steps: 2,
      durationMs: 1_500,
      stepLatenciesMs: [800, 600],
      tools: [{ tool: "searchTiles", ms: 12, status: "ok" }],
      inputTokens: 900,
      outputTokens: 120,
    });
    spy.mockRestore();
  });

  it("marks turns that hit the step cap", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const turn = createTurnLogger({ requestId: "r2", ipHash: "abc" });
    turn.hooks.onFinish({ steps: 10, finishReason: "stop", inputTokens: 1, outputTokens: 1, hitStepCap: true });
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ outcome: "step_cap" });
    log.mockRestore();
  });

  it("logs failures as errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const turn = createTurnLogger({ requestId: "r3", ipHash: "abc" });
    turn.failed("quota_exhausted", new Error("429"));
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({ level: "error", event: "chat_turn", outcome: "quota_exhausted", message: "429" });
    error.mockRestore();
  });

  it("logs a client abort with the steps and tools completed so far", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let now = 1_000;
    const turn = createTurnLogger({ requestId: "r4", ipHash: "abc" }, () => now);
    turn.hooks.onTool({ tool: "searchTiles", ms: 12, status: "ok" });
    turn.hooks.onStep({ step: 0, ms: 800, toolCalls: ["searchTiles"], finishReason: "tool-calls" });
    now = 1_900;
    turn.aborted();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
      level: "warn",
      event: "chat_turn",
      requestId: "r4",
      outcome: "aborted",
      steps: 1,
      stepLatenciesMs: [800],
      durationMs: 900,
      tools: [{ tool: "searchTiles", status: "ok" }],
    });
    warn.mockRestore();
  });

  it("logs exactly one chat_turn line whatever mix of finish, failure and abort arrives", () => {
    const spies = (["log", "warn", "error"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    const lines = () => spies.flatMap((spy) => spy.mock.calls.map((call) => JSON.parse(String(call[0])))).filter((l) => l.event === "chat_turn");
    const summary = { steps: 1, finishReason: "stop", inputTokens: 1, outputTokens: 1, hitStepCap: false };
    const orders: ((t: ReturnType<typeof createTurnLogger>) => void)[][] = [
      [(t) => t.hooks.onFinish(summary), (t) => t.failed("model_error", new Error("x")), (t) => t.aborted()],
      [(t) => t.failed("model_error", new Error("x")), (t) => t.hooks.onFinish(summary), (t) => t.aborted()],
      [(t) => t.aborted(), (t) => t.hooks.onFinish(summary), (t) => t.failed("model_error", new Error("x"))],
      [(t) => t.aborted(), (t) => t.aborted()],
    ];
    const expected = ["ok", "model_error", "aborted", "aborted"];
    orders.forEach((order, i) => {
      for (const spy of spies) spy.mockClear();
      const turn = createTurnLogger({ requestId: `r${i}`, ipHash: "abc" });
      for (const event of order) event(turn);
      expect(lines(), `order ${i}`).toHaveLength(1);
      expect(lines()[0].outcome, `order ${i}`).toBe(expected[i]);
    });
    for (const spy of spies) spy.mockRestore();
  });
});
