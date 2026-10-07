import type { Catalog } from "@/lib/data/catalog";
import { answerOf, traceOf } from "./trace";
import type { TurnRecord } from "./harness";
import { WORST_CASE_TURN_CALLS } from "./options";
import type { ScenarioResult } from "./report";
import type { Scenario } from "./scenarios";
import { type Check, scoreScenario, scoreTurn } from "./score";

/** A model call that fails is retried once by the SDK (maxRetries: 1), so a failed turn spent two extra calls. */
const FAILED_CALL_COST = 2;

export interface RunnerInput {
  scenarios: Scenario[];
  run: (history: TurnRecord["messages"], text: string, mode: Scenario["mode"]) => Promise<TurnRecord>;
  maxCalls: number;
  /** The catalog every quote line's unit price is checked against. */
  catalog: Pick<Catalog, "get">;
  /** Waits between turns so the run stays under the requests-per-minute limit; omitted for scripted runs. */
  pacer?: { waitForTurn(): Promise<void>; record(count: number): void };
  /** One line per turn, then one for the scenario's own checks. */
  onProgress?: (scenarioId: string, line: string) => void;
}

const failingNames = (checks: Check[]) => checks.filter((c) => !c.ok).map((c) => c.name);

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

export async function runScenarios({ scenarios, run, maxCalls, catalog, pacer, onProgress }: RunnerInput): Promise<RunnerOutput> {
  let callsUsed = 0;
  let stepsSummed = 0;
  let embeddingCalls = 0;
  let stopReason: string | null = null;
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const skipped = (reason: string) =>
      results.push({ id: scenario.id, title: scenario.title, mode: scenario.mode, turns: null, checks: [], skippedReason: reason });
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
      const { checks, metrics } = scoreTurn({ messages: record.messages, turnLog: record.turnLog, error: record.error, asks: turn.asks, catalog });
      const assistant = record.messages.at(-1);
      turns.push({
        checks,
        metrics,
        ...(metrics.outcome !== "ok" && record.errorMessage !== null ? { error: record.errorMessage } : {}),
        keywordFallbacks: record.keywordFallbacks,
        ...(assistant?.role === "assistant" ? { answer: answerOf(assistant), trace: traceOf(assistant) } : {}),
      });
      history = record.messages;
      const spent = Math.max(1, metrics.steps) + (record.error ? FAILED_CALL_COST : 0);
      callsUsed += spent;
      stepsSummed += metrics.steps;
      embeddingCalls += record.embedCalls;
      pacer?.record(spent);
      const failed = failingNames(checks);
      onProgress?.(scenario.id, `${metrics.steps} steps, ${metrics.durationMs} ms${failed.length ? `, failing ${failed.join(", ")}` : ", ok"}`);
      if (record.error === "quota_exhausted" || record.error === "rate_limited") {
        stopReason = `the model returned ${record.error}`;
        break;
      }
      // After a failed turn the conversation is broken: the next turns would only repeat it and spend calls.
      if (metrics.outcome !== "ok") break;
    }
    const notSent = scenario.turns.slice(turns.length).map((_, i) => turns.length + i + 1);
    // Half a conversation is never scored as if it had finished.
    const checks = notSent.length
      ? [{ name: "incomplete", ok: false, detail: `${turns.length} de ${scenario.turns.length} turnos corrieron; no enviados: ${notSent.map((n) => `T${n}`).join(", ")}` }]
      : scoreScenario(history, scenario.expect);
    const failed = failingNames(checks);
    onProgress?.(scenario.id, `scenario checks${failed.length ? `: failing ${failed.join(", ")}` : " ok"}`);
    results.push({ id: scenario.id, title: scenario.title, mode: scenario.mode, turns, checks, ...(notSent.length ? { notSent } : {}) });
  }
  return { results, callsUsed, stepsSummed, embeddingCalls, stopReason };
}

/** An early stop (budget or quota) leaves a partial report, so the process must not exit green. Failed scenarios still exit 0. */
export function exitCodeFor(stopReason: string | null): 0 | 2 {
  return stopReason ? 2 : 0;
}
