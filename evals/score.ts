import type { CoronaUIMessage } from "@/lib/agent/agent";
import { citationIdsIn } from "@/lib/ui/citations";
import { deriveProject } from "@/lib/ui/derive-project";
import { isToolPart, type ToolName, toolNameOf } from "@/lib/ui/tool-parts";
import type { TurnExpect } from "./scenarios";

/** The `chat_turn` log line the handler writes for each turn (see lib/chat/turn-log.ts). */
export interface TurnLog {
  outcome: string;
  steps: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface TurnMetrics {
  steps: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  tools: string[];
  ungrounded: number[];
  citedIds: string[];
  unverifiedIds: string[];
  returnedIds: string[];
  /** Quote lines whose quantity did not come from computeMaterials (or a stale quote). */
  quantityFlags: string[];
}

export interface TurnInput {
  /** The whole conversation up to and including this turn's assistant message. */
  messages: CoronaUIMessage[];
  turnLog: TurnLog | null;
  /** A stream error code (e.g. quota_exhausted) or an HTTP rejection, if the turn failed. */
  error: string | null;
  expect: TurnExpect;
}

export const DEFAULT_MAX_STEPS = 7;

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const textOf = (message: CoronaUIMessage) => message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");

const outputsOf = (messages: CoronaUIMessage[]) =>
  messages.flatMap((m) => (m.role === "assistant" ? m.parts.flatMap((p) => (isToolPart(p) && p.state === "output-available" ? [p.output] : [])) : []));

/**
 * Numbers as written in Spanish prose: "1.500.000" (thousands), "6,6" (decimal), "55,2 × 55,2", "10 %". Skips list
 * ordinals, citation ids, URLs and digits glued to letters ("m2", "60x120"), which are labels rather than claims.
 */
export function extractNumbers(text: string): number[] {
  const cleaned = text
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[?c\d{4}\]?/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ");
  const numbers: number[] = [];
  for (const match of cleaned.matchAll(/(?<![\p{L}\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\d])/gu)) {
    const raw = match[1];
    const value = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw) ? Number(raw.replaceAll(".", "").replace(",", ".")) : Number(raw.replace(",", "."));
    if (Number.isFinite(value)) numbers.push(value);
  }
  return numbers;
}

/** Every number a tool output or the user stated, plus the forms prose derives from them (percent, cm, rounding). */
export function allowedNumbers(sources: unknown[], userTexts: string[]): Set<number> {
  const allowed = new Set<number>();
  const add = (n: number) => {
    for (const v of [n, n * 100, n / 10]) for (const d of [0, 1, 2]) allowed.add(Number(v.toFixed(d)));
  };
  const visit = (node: unknown) => {
    if (typeof node === "number") add(node);
    else if (typeof node === "string") extractNumbers(node).forEach(add);
    else if (Array.isArray(node)) node.forEach(visit);
    else if (node !== null && typeof node === "object") Object.values(node).forEach(visit);
  };
  sources.forEach(visit);
  userTexts.flatMap(extractNumbers).forEach(add);
  return allowed;
}

/** Peso amounts written as "$330.012". */
const moneyIn = (text: string) => [...text.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/g)].map((m) => Number(m[1].replaceAll(".", "")));

export function scoreTurn({ messages, turnLog, error, expect }: TurnInput): { checks: Check[]; metrics: TurnMetrics } {
  const assistant = messages.at(-1)!;
  const text = textOf(assistant);
  const plain = normalize(text);
  const userTexts = messages.filter((m) => m.role === "user").map(textOf);
  const allOutputs = outputsOf(messages);
  const turnTools = assistant.parts.filter(isToolPart).map((p) => toolNameOf(p));
  const project = deriveProject(messages);

  const allowed = allowedNumbers(allOutputs, userTexts);
  const ungrounded = extractNumbers(text).filter((n) => !allowed.has(Number(n.toFixed(2))));
  const toolMoney = allowedNumbers(allOutputs, []);
  const userOnlyMoney = moneyIn(text).filter((n) => !toolMoney.has(n));
  const returnedIds = [...new Set(allOutputs.flatMap(citationIdsIn))];
  const citedIds = [...new Set([...text.matchAll(/\[(c\d{4})\]/g)].map((m) => m[1]))];
  const unverifiedIds = citedIds.filter((id) => !returnedIds.includes(id));

  const quotedThisTurn = turnTools.includes("buildQuote");
  const quote = project.quote;
  const quantityFlags = quotedThisTurn && quote ? Object.entries(quote.lineChecks).filter(([, c]) => c !== "computed").map(([sku, c]) => `${sku}:${c}`) : [];
  if (quotedThisTurn && quote?.stale) quantityFlags.push("stale");

  const turnOutputs = outputsOf([assistant]) as { status?: string; data?: { verdict?: string } }[];
  const toolSaysReview = turnOutputs.some((o) => o?.status === "needs_review" || o?.data?.verdict === "needs_review");

  const steps = turnLog?.steps ?? 0;
  const maxSteps = expect.maxSteps ?? DEFAULT_MAX_STEPS;
  const checks: Check[] = [
    { name: "completed", ok: error === null && turnLog?.outcome === "ok", detail: error ?? turnLog?.outcome ?? "sin línea chat_turn" },
    { name: "steps", ok: steps > 0 && steps <= maxSteps, detail: `${steps} pasos (máx. ${maxSteps})` },
    { name: "grounded-numbers", ok: ungrounded.length === 0, detail: ungrounded.length ? `sin fuente: ${ungrounded.join(", ")}` : "todos los números salen de una tool o del usuario" },
    { name: "money-from-tools", ok: userOnlyMoney.length === 0, detail: userOnlyMoney.length ? `montos que no salieron de una tool: ${userOnlyMoney.join(", ")}` : "ok" },
    { name: "citations-verified", ok: unverifiedIds.length === 0, detail: unverifiedIds.length ? `citas que ninguna tool devolvió: ${unverifiedIds.join(", ")}` : `${citedIds.length} citas, todas verificadas` },
    { name: "quantities-computed", ok: quantityFlags.length === 0, detail: quantityFlags.length ? quantityFlags.join(", ") : "ok" },
    { name: "review-honesty", ok: !toolSaysReview || plain.includes("requiere revision"), detail: toolSaysReview ? "una tool pidió revisión" : "nada que revisar" },
  ];

  for (const tool of expect.must ?? []) checks.push({ name: `calls:${tool}`, ok: turnTools.includes(tool), detail: turnTools.join(" → ") || "ninguna tool" });
  for (const tool of expect.mustNot ?? []) checks.push({ name: `skips:${tool}`, ok: !turnTools.includes(tool), detail: turnTools.join(" → ") || "ninguna tool" });
  if (expect.quote) {
    const data = quotedThisTurn ? quote?.data : undefined;
    const ok =
      expect.quote === "none"
        ? !quotedThisTurn
        : expect.quote === "within"
          ? data?.withinBudget === true
          : expect.quote === "over"
            ? data?.withinBudget === false
            : data !== undefined && data.budget === null && data.withinBudget === null;
    checks.push({ name: `quote:${expect.quote}`, ok, detail: data ? `total ${data.total}, withinBudget ${String(data.withinBudget)}` : "sin cotización en este turno" });
  }
  if (expect.asks) checks.push({ name: "asks", ok: text.includes("?"), detail: text.slice(0, 120) });
  if (expect.mentionsAny) {
    const hit = expect.mentionsAny.find((phrase) => plain.includes(normalize(phrase)));
    checks.push({ name: "mentions", ok: hit !== undefined, detail: hit ?? `ninguna de: ${expect.mentionsAny.join(" | ")}` });
  }

  return {
    checks,
    metrics: {
      steps,
      durationMs: turnLog?.durationMs ?? 0,
      inputTokens: turnLog?.inputTokens ?? 0,
      outputTokens: turnLog?.outputTokens ?? 0,
      tools: turnTools as ToolName[],
      ungrounded,
      citedIds,
      unverifiedIds,
      returnedIds,
      quantityFlags,
    },
  };
}
