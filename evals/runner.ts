import type { TurnRecord } from "./harness";
import { WORST_CASE_TURN_CALLS } from "./options";
import type { ScenarioResult } from "./report";
import type { Scenario } from "./scenarios";
import { scoreTurn } from "./score";

/** A model call that fails is retried once by the SDK (maxRetries: 1), so a failed turn spent two extra calls. */
const FAILED_CALL_COST = 2;

export interface RunnerInput {
  scenarios: Scenario[];
  run: (history: TurnRecord["messages"], text: string, mode: Scenario["mode"]) => Promise<TurnRecord>;
  maxCalls: number;
  /** Waits between turns so the run stays under the requests-per-minute limit; omitted for scripted runs. */
  pacer?: { waitForTurn(): Promise<void>; record(count: number): void };
  onTurn?: (scenarioId: string, line: string) => void;
}

export interface RunnerOutput {
  results: ScenarioResult[];
  /** Model calls actually spent, counting each failed call and its retry. */
  callsUsed: number;
  /** The same calls as the handler's step counts add up to (what the model reported finishing). */
  stepsSummed: number;
  /** Query-embedding calls, on a separate quota from the model. */
  embeddingCalls: number;
  stopReason: string | null;
}

export async function runScenarios({ scenarios, run, maxCalls, pacer, onTurn }: RunnerInput): Promise<RunnerOutput> {
  let callsUsed = 0;
  let stepsSummed = 0;
  let embeddingCalls = 0;
  let stopReason: string | null = null;
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const skipped = (reason: string) => results.push({ id: scenario.id, title: scenario.title, mode: scenario.mode, turns: null, skippedReason: reason });
    if (stopReason) {
      skipped(stopReason);
      continue;
    }
    // Reserve the whole scenario up front: half a conversation must never be reported as a pass.
    if (callsUsed + scenario.turns.length * WORST_CASE_TURN_CALLS > maxCalls) {
      stopReason = `call budget reached (${callsUsed}/${maxCalls}; this scenario can need ${scenario.turns.length * WORST_CASE_TURN_CALLS})`;
      skipped(stopReason);
      continue;
    }
    const turns: NonNullable<ScenarioResult["turns"]> = [];
    let history: TurnRecord["messages"] = [];
    for (const turn of scenario.turns) {
      await pacer?.waitForTurn();
      const record = await run(history, turn.user, scenario.mode);
      const { checks, metrics } = scoreTurn({ messages: record.messages, turnLog: record.turnLog, error: record.error, expect: turn.expect });
      turns.push({ checks, metrics, keywordFallbacks: record.keywordFallbacks });
      history = record.messages;
      const spent = Math.max(1, metrics.steps) + (record.error ? FAILED_CALL_COST : 0);
      callsUsed += spent;
      stepsSummed += metrics.steps;
      embeddingCalls += record.embedCalls;
      pacer?.record(spent);
      const failed = checks.filter((c) => !c.ok).map((c) => c.name);
      onTurn?.(scenario.id, `${metrics.steps} steps, ${metrics.durationMs} ms${failed.length ? `, failing ${failed.join(", ")}` : ", ok"}`);
      if (record.error === "quota_exhausted" || record.error === "rate_limited") {
        stopReason = `the model returned ${record.error}`;
        break;
      }
    }
    if (turns.length < scenario.turns.length) {
      turns[turns.length - 1].checks.push({ name: "incomplete", ok: false, detail: `${turns.length} de ${scenario.turns.length} turnos corrieron` });
    }
    results.push({ id: scenario.id, title: scenario.title, mode: scenario.mode, turns });
  }
  return { results, callsUsed, stepsSummed, embeddingCalls, stopReason };
}

/** An early stop (budget or quota) leaves a partial report, so the process must not exit green. Failed scenarios still exit 0. */
export function exitCodeFor(stopReason: string | null): 0 | 2 {
  return stopReason ? 2 : 0;
}
