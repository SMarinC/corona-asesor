import type { AgentHooks, StepLog, ToolCallLog, TurnSummary } from "@/lib/agent/agent";
import { errorMessage, log } from "@/lib/log";

/**
 * Collects a turn's tool and step events and emits exactly one structured `chat_turn` line: whichever of
 * onFinish, failed or aborted comes first wins; the others are ignored.
 */
export function createTurnLogger(base: { requestId: string; ipHash: string }, now: () => number = Date.now) {
  const startedAt = now();
  const tools: ToolCallLog[] = [];
  const steps: StepLog[] = [];
  // After a stream error the SDK still fires onEnd, and a client can disconnect after the turn ended: only the first
  // outcome is logged.
  let done = false;
  const finish = () => {
    if (done) return false;
    done = true;
    return true;
  };

  const hooks = {
    onTool: (entry: ToolCallLog) => {
      tools.push(entry);
    },
    onStep: (entry: StepLog) => {
      steps.push(entry);
    },
    onFinish: (summary: TurnSummary) => {
      if (!finish()) return;
      log("info", "chat_turn", {
        ...base,
        outcome: summary.hitStepCap ? "step_cap" : "ok",
        ...summary,
        durationMs: now() - startedAt,
        stepLatenciesMs: steps.map((s) => s.ms),
        tools,
      });
    },
  } satisfies Required<Omit<AgentHooks, "onModelCall">>;

  return {
    hooks,
    failed: (code: string, error: unknown) => {
      if (!finish()) return;
      log("error", "chat_turn", { ...base, outcome: code, message: errorMessage(error), durationMs: now() - startedAt, steps: steps.length, tools });
    },
    /**
     * The turn ended early: the client went away ("aborted") or the turn hit its time budget ("timeout"). The SDK
     * then skips onEnd, so this is the turn's line.
     */
    aborted: (outcome: "aborted" | "timeout" = "aborted") => {
      if (!finish()) return;
      log("warn", "chat_turn", {
        ...base,
        outcome,
        durationMs: now() - startedAt,
        steps: steps.length,
        stepLatenciesMs: steps.map((s) => s.ms),
        tools,
      });
    },
  };
}
