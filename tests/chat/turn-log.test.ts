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

  it("marks turns that hit the step cap and logs failures as errors", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const turn = createTurnLogger({ requestId: "r2", ipHash: "abc" });
    turn.hooks.onFinish({ steps: 10, finishReason: "stop", inputTokens: 1, outputTokens: 1, hitStepCap: true });
    turn.failed("quota_exhausted", new Error("429"));
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ outcome: "step_cap" });
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({ event: "chat_turn", outcome: "quota_exhausted", message: "429" });
    log.mockRestore();
    error.mockRestore();
  });
});
