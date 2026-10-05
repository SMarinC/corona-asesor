/**
 * Grounding evals against the real model: `npm run evals` (needs GOOGLE_GENERATIVE_AI_API_KEY in .env.local).
 * Spends free-tier quota, so it paces itself (default 10 model calls per minute) and stops at a call budget.
 *
 *   npm run evals -- --only bathroom-budget,fake-price   run a subset
 *   npm run evals -- --max-calls 60                      lower the budget (default 110)
 *   npm run evals -- --scripted                          plumbing check with the scripted model: no quota
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MODEL_ID } from "@/lib/agent/agent";
import { PROMPT_VERSION } from "@/lib/agent/prompt";
import { runTurn } from "./harness";
import { type EvalRun, renderReport, type ScenarioResult, summarize } from "./report";
import { SCENARIOS } from "./scenarios";
import { scoreTurn } from "./score";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const scripted = args.includes("--scripted");
const only = flag("only")?.split(",");
const maxCalls = Number(flag("max-calls") ?? 110);
const callsPerMinute = Number(flag("rpm") ?? 10);
/** A turn can take up to 10 model calls; never start one that could overrun the budget. */
const WORST_CASE_TURN_CALLS = 10;

const model = scripted ? (await import("@/lib/chat/scripted-model")).createScriptedDemoModel({ delayMs: 0 }) : undefined;
if (!scripted && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set (npm run evals loads .env.local).");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let callsUsed = 0;
let stopReason: string | null = null;
const results: ScenarioResult[] = [];

for (const scenario of SCENARIOS) {
  if (only && !only.includes(scenario.id)) continue;
  if (stopReason) {
    results.push({ id: scenario.id, title: scenario.title, mode: scenario.mode, turns: null, skippedReason: stopReason });
    continue;
  }
  const turns: NonNullable<ScenarioResult["turns"]> = [];
  let history: Awaited<ReturnType<typeof runTurn>>["messages"] = [];
  for (const turn of scenario.turns) {
    if (callsUsed + WORST_CASE_TURN_CALLS > maxCalls) {
      stopReason = `call budget reached (${callsUsed}/${maxCalls})`;
      break;
    }
    const started = Date.now();
    const record = await runTurn(history, turn.user, scenario.mode, model);
    const { checks, metrics } = scoreTurn({ messages: record.messages, turnLog: record.turnLog, error: record.error, expect: turn.expect });
    turns.push({ checks, metrics, keywordFallbacks: record.keywordFallbacks });
    history = record.messages;
    callsUsed += metrics.steps || 1;
    const failed = checks.filter((c) => !c.ok).map((c) => c.name);
    console.log(`${scenario.id}: ${metrics.steps} steps, ${metrics.durationMs} ms${failed.length ? `, failing ${failed.join(", ")}` : ", ok"}`);
    if (record.error === "quota_exhausted" || record.error === "rate_limited") {
      stopReason = `the model returned ${record.error}`;
      break;
    }
    // Pace by the calls this turn spent, so the run never exceeds the free tier's requests per minute.
    if (!scripted) await sleep(Math.max(0, ((metrics.steps || 1) * 60_000) / callsPerMinute - (Date.now() - started)));
  }
  results.push({ id: scenario.id, title: scenario.title, mode: scenario.mode, turns: turns.length ? turns : null, skippedReason: turns.length ? undefined : (stopReason ?? undefined) });
}

const run: EvalRun = { date: new Date().toISOString().slice(0, 10), model: scripted ? "scripted (no model)" : MODEL_ID, promptVersion: PROMPT_VERSION, results };
const outDir = scripted ? "evals/out" : "evals";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/report.md`, renderReport(run));
writeFileSync(`${outDir}/results.json`, `${JSON.stringify({ ...run, summary: summarize(run) }, null, 2)}\n`);
const summary = summarize(run);
console.log(`\n${summary.passed}/${summary.total} scenarios passed · ${summary.modelCalls} model calls · report in ${outDir}/report.md`);
if (stopReason) console.log(`Stopped early: ${stopReason}`);
