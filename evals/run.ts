/**
 * Grounding evals against the real model: `npm run evals` (needs GOOGLE_GENERATIVE_AI_API_KEY in .env.local).
 * Spends free-tier quota, so it paces itself (default 10 model calls per minute, sliding window) and stops at a
 * call budget that also reserves whole multi-turn scenarios.
 *
 *   npm run evals -- --only bathroom-budget,fake-price   run a subset
 *   npm run evals -- --max-calls 60                      lower the budget (default 110)
 *   npm run evals -- --rpm 12                            calls per minute (10 to 15)
 *   npm run evals -- --scripted                          plumbing check with the scripted model: no network at all
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MODEL_ID } from "@/lib/agent/agent";
import { PROMPT_VERSION } from "@/lib/agent/prompt";
import { getCatalog } from "@/lib/data/catalog";
import { runTurn } from "./harness";
import { parseOptions, WORST_CASE_TURN_CALLS } from "./options";
import { createPacer } from "./pacer";
import { barLabel, type EvalRun, renderReport, summarize } from "./report";
import { exitCodeFor, runScenarios } from "./runner";
import { SCENARIOS } from "./scenarios";

let options: ReturnType<typeof parseOptions>;
try {
  options = parseOptions(process.argv.slice(2), SCENARIOS.map((s) => s.id));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const { scripted, only, maxCalls, rpm } = options;

const model = scripted ? (await import("@/lib/chat/scripted-model")).createScriptedDemoModel({ delayMs: 0 }) : undefined;
if (!scripted && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set (npm run evals loads .env.local).");
  process.exit(1);
}

const scenarios = SCENARIOS.filter((s) => !only || only.includes(s.id));
const out = await runScenarios({
  scenarios,
  // Scripted runs force the throwing embedder, so they cannot reach the network even if a scenario searches the sheets.
  run: (history, text, mode) => runTurn(history, text, mode, model, { offline: scripted }),
  maxCalls,
  catalog: getCatalog(),
  pacer: scripted ? undefined : createPacer({ rpm, worstCase: WORST_CASE_TURN_CALLS }),
  onProgress: (id, line) => console.log(`${id}: ${line}`),
});

const run: EvalRun = {
  date: new Date().toISOString().slice(0, 10),
  model: scripted ? "scripted (no model)" : MODEL_ID,
  promptVersion: PROMPT_VERSION,
  results: out.results,
  calls: { used: out.callsUsed, steps: out.stepsSummed, embeddings: out.embeddingCalls },
  subset: scenarios.length < SCENARIOS.length,
};
const outDir = scripted ? "evals/out" : "evals";
mkdirSync(outDir, { recursive: true });
const summary = summarize(run);
writeFileSync(`${outDir}/report.md`, renderReport(run));
writeFileSync(`${outDir}/results.json`, `${JSON.stringify({ ...run, summary }, null, 2)}\n`);
console.log(
  [
    `\n${summary.passed}/${summary.total} scenarios passed · success bar ${barLabel(summary.meetsBar)} · prompt ${summary.promptVersion}`,
    `money not from tools: ${summary.moneyNotFromTools} · invented quantities: ${summary.inventedQuantities} · median ${summary.medianSteps} steps per completed turn · p95 ${(summary.p95LatencyMs / 1000).toFixed(1)} s · ${summary.timeouts} timeouts · ${summary.rejectedCalls} herramientas fuera de paso`,
    `${out.callsUsed} model calls (${out.stepsSummed} steps summed) · ${out.embeddingCalls} embedding queries · report in ${outDir}/report.md`,
  ].join("\n"),
);
if (out.stopReason) console.log(`Stopped early: ${out.stopReason}`);
process.exitCode = exitCodeFor(out.stopReason);
