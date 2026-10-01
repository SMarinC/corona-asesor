import type { AgentHooks, StepLog, ToolCallLog, TurnSummary } from "@/lib/agent/agent";
import { errorMessage, log } from "@/lib/log";

/** Collects a turn's tool and step events and emits exactly one structured `chat_turn` line. */
export function createTurnLogger(base: { requestId: string; ipHash: string }, now: () => number = Date.now) {
  const startedAt = now();
  const tools: ToolCallLog[] = [];
  const steps: StepLog[] = [];

  const hooks = {
    onTool: (entry: ToolCallLog) => {
      tools.push(entry);
    },
    onStep: (entry: StepLog) => {
      steps.push(entry);
    },
    onFinish: (summary: TurnSummary) => {
      log("info", "chat_turn", {
        ...base,
        outcome: summary.hitStepCap ? "step_cap" : "ok",
        ...summary,
        durationMs: now() - startedAt,
        stepLatenciesMs: steps.map((s) => s.ms),
        tools,
      });
    },
  } satisfies Required<AgentHooks>;

  return {
    hooks,
    failed: (code: string, error: unknown) => {
      log("error", "chat_turn", { ...base, outcome: code, message: errorMessage(error), durationMs: now() - startedAt, steps: steps.length, tools });
    },
  };
}
