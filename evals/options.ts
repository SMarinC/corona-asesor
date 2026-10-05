import { MAX_STEPS } from "@/lib/agent/agent";

/** A turn can take up to MAX_STEPS model calls; the pacer and the budget both reserve that much. */
export const WORST_CASE_TURN_CALLS = MAX_STEPS;
/** Free-tier requests per minute for gemini-3.5-flash-lite. */
export const FREE_TIER_RPM = 15;

export interface EvalOptions {
  scripted: boolean;
  only: string[] | undefined;
  maxCalls: number;
  rpm: number;
}

function numberFlag(args: string[], name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const raw = args[i + 1];
  const value = raw === undefined || raw.startsWith("--") || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} needs a finite number greater than 0, got ${raw === undefined ? "nothing" : `"${raw}"`}.`);
  return value;
}

/** Parses the runner's flags, failing loudly on a malformed one instead of silently running unpaced or unbudgeted. */
export function parseOptions(args: string[]): EvalOptions {
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1]?.split(",") : undefined;
  if (onlyIndex >= 0 && !only) throw new Error("--only needs a comma-separated list of scenario ids.");
  const rpm = Math.min(numberFlag(args, "rpm", 10), FREE_TIER_RPM);
  if (rpm < WORST_CASE_TURN_CALLS) throw new Error(`--rpm must be at least ${WORST_CASE_TURN_CALLS}: one worst-case turn needs that many calls in a minute.`);
  return { scripted: args.includes("--scripted"), only, maxCalls: Math.floor(numberFlag(args, "max-calls", 110)), rpm };
}
