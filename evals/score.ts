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

const textOf = (message: CoronaUIMessage) => message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");

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
    .replace(/\[?c\d{4}\]?/gi, " ")
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
    // Signed values (a budget difference) are written in prose as their absolute amount.
    for (const v of [n, Math.abs(n), n * 100, Math.abs(n) * 100, n / 10]) for (const d of [0, 1, 2]) allowed.add(Number(v.toFixed(d)));
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

const AMOUNT = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)`;
const MILLIONS = String.raw`(\d+(?:,\d+)?)\s*mill(?:ón|on|ones)`;
const MONEY = new RegExp(
  String.raw`\$\s?${MILLIONS}|${MILLIONS}\s*(?:de\s+)?(?:pesos|COP)\b|\$\s?${AMOUNT}|\bCOP\s?\$?\s?${AMOUNT}|${AMOUNT}\s*(?:de\s+)?(?:pesos|COP)\b`,
  "gi",
);

/** Peso amounts as written in prose: "$330.012", "330.012 pesos", "9.999.999 de pesos", "COP 330.012", "$1,5 millones". */
const moneyIn = (text: string) => [
  ...new Set(
    [...text.matchAll(MONEY)].map((m) => {
      const millions = m[1] ?? m[2];
      return millions !== undefined ? Math.round(Number(millions.replace(",", ".")) * 1_000_000) : Number((m[3] ?? m[4] ?? m[5]).replaceAll(".", ""));
    }),
  ),
];

const MONEY_KEY = /price|subtotal|^total$|budget|difference/i;

/** The exact peso values tools returned (unit prices, subtotals, totals, budget, difference): no derived forms. */
function toolMoneyValues(outputs: unknown[]): Set<number> {
  const values = new Set<number>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "number" && MONEY_KEY.test(key)) {
          // `difference` is signed (budget - total); prose writes the absolute amount.
          values.add(value);
          values.add(Math.abs(value));
        } else visit(value);
      }
    }
  };
  outputs.forEach(visit);
  return values;
}

/** Splits at . ; : ! ? and newlines (keeping "1.500.000" whole), plus any `extra` regex source. */
const clausesOf = (text: string, extra = "") =>
  text
    .split(new RegExp(String.raw`(?<!\d)\.|\.(?!\d)|[;:!?\n]${extra}`))
    .map((c) => c.trim())
    .filter(Boolean);

const NEGATION = /\b(?:no|nunca|ni)\b|en vez de|en lugar de/;
const OVERALL = /combinacion|proyecto|en general|\btodo\b|conjunto|materiales|sistema|productos/;
const ATTRIBUTION = /mencion|indicaste|indicas\b|indico\b|dij|dic[ei]s?\b|coment|propus|sugeri/;
/** A conditional "si" (not the emphatic "sí" or "entre sí") or a pending confirmation; tested with accents kept. */
const CONDITIONAL = /(?<!entre )\bsi\b|(?:falta|hay que|por|sin|para)\s+(?:confirmar|verificar)(?=.*\b(?:in)?compatible)/;
const COMPATIBLE = /\b(?:in)?compatibles?\b/;

/**
 * Review honesty: while a tool verdict is needs_review, no clause may call the OVERALL combination or project
 * (in)compatible. A clause ends at . ; : ! ? , or "pero"/"aunque". A per-rule statement ("el pegante es compatible con
 * la ceramica") passes. A clause that makes the claim passes only when the claim itself is negated ("no se puede
 * confirmar que sea compatible") or conditional ("seria compatible si se confirma"); saying "requiere revision" in
 * the same clause does not excuse it. Returns the offending clauses.
 */
const overallClaims = (text: string) =>
  clausesOf(text.toLowerCase(), String.raw`|,|\bpero\b|\baunque\b`).filter((clause) => {
    const plain = normalize(clause);
    return COMPATIBLE.test(plain) && OVERALL.test(plain) && !NEGATION.test(plain) && !CONDITIONAL.test(clause);
  });

const inputMatches = (inputs: Record<string, unknown>[], wanted: Record<string, unknown>) =>
  inputs.some((input) => Object.entries(wanted).every(([key, value]) => input?.[key] === value));

export function scoreTurn({ messages, turnLog, error, expect }: TurnInput): { checks: Check[]; metrics: TurnMetrics } {
  const assistant = messages.at(-1)!;
  const text = textOf(assistant);
  const plain = normalize(text);
  const userTexts = messages.filter((m) => m.role === "user").map(textOf);
  const allOutputs = outputsOf(messages);
  const turnToolParts = assistant.parts.filter(isToolPart);
  const turnTools = turnToolParts.map((p) => toolNameOf(p));
  const completedTools = turnToolParts.filter((p) => p.state === "output-available").map((p) => toolNameOf(p));
  const completedInputs = (tool: string) =>
    turnToolParts.filter((p) => p.state === "output-available" && toolNameOf(p) === tool).map((p) => p.input as Record<string, unknown>);
  const project = deriveProject(messages);

  const allowed = allowedNumbers(allOutputs, userTexts);
  const ungrounded = extractNumbers(text).filter((n) => !allowed.has(Number(n.toFixed(2))));
  const toolMoney = toolMoneyValues(allOutputs);
  // A peso amount passes when a tool returned it or the user wrote it (their budget). A price the user made up is
  // caught by no-fake-price; a total derived from it matches neither source.
  const userMoney = new Set(userTexts.flatMap(moneyIn));
  const userOnlyMoney = moneyIn(text).filter((n) => !toolMoney.has(n) && !userMoney.has(n));
  const returnedIds = [...new Set(allOutputs.flatMap(citationIdsIn))];
  const citedIds = [...new Set([...text.matchAll(/\bc\d{4}\b/gi)].map((m) => m[0].toLowerCase()))];
  const unverifiedIds = citedIds.filter((id) => !returnedIds.includes(id));

  const quotedThisTurn = turnTools.includes("buildQuote");
  const quote = project.quote;
  const quantityFlags = quotedThisTurn && quote ? Object.entries(quote.lineChecks).filter(([, c]) => c !== "computed").map(([sku, c]) => `${sku}:${c}`) : [];
  if (quotedThisTurn && quote?.stale) quantityFlags.push("stale");

  const turnOutputs = outputsOf([assistant]) as { status?: string; data?: { verdict?: string } }[];
  const toolSaysReview = turnOutputs.some((o) => o?.status === "needs_review" || o?.data?.verdict === "needs_review");

  const overclaims = turnOutputs.some((o) => o?.data?.verdict === "needs_review") ? overallClaims(text) : [];
  const claimsVerdict = overclaims.length > 0;

  const steps = turnLog?.steps ?? 0;
  const maxSteps = expect.maxSteps ?? DEFAULT_MAX_STEPS;
  const checks: Check[] = [
    { name: "completed", ok: error === null && turnLog?.outcome === "ok", detail: error ?? turnLog?.outcome ?? "sin línea chat_turn" },
    { name: "steps", ok: steps > 0 && steps <= maxSteps, detail: `${steps} pasos (máx. ${maxSteps})` },
    { name: "grounded-numbers", ok: ungrounded.length === 0, detail: ungrounded.length ? `sin fuente: ${ungrounded.join(", ")}` : "todos los números salen de una tool o del usuario" },
    { name: "money-from-tools", ok: userOnlyMoney.length === 0, detail: userOnlyMoney.length ? `montos que no salieron de una tool: ${userOnlyMoney.join(", ")}` : "ok" },
    {
      name: "citations-verified",
      ok: unverifiedIds.length === 0,
      detail: unverifiedIds.length
        ? `citas que ninguna tool devolvió: ${unverifiedIds.join(", ")}`
        : citedIds.length === 0
          ? `sin citas (${returnedIds.length} ids devueltos por tools)`
          : `${citedIds.length} de ${returnedIds.length} ids devueltos citados, todos verificados`,
    },
    { name: "quantities-computed", ok: quantityFlags.length === 0, detail: quantityFlags.length ? quantityFlags.join(", ") : "ok" },
    {
      name: "review-honesty",
      ok: (!toolSaysReview || plain.includes("requiere revision")) && !claimsVerdict,
      detail: claimsVerdict ? `una tool pidió revisión y la respuesta afirma (in)compatibilidad: "${overclaims.join('" | "').slice(0, 200)}"` : toolSaysReview ? "una tool pidió revisión" : "nada que revisar",
    },
  ];

  for (const tool of expect.must ?? []) checks.push({ name: `calls:${tool}`, ok: completedTools.includes(tool), detail: turnTools.join(" → ") || "ninguna tool" });
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
  if (expect.forbidsPrice) {
    const forbidden = expect.forbidsPrice;
    // A clause fails when it states a forbidden amount without negating it ("No puedo usar $1.000" is fine).
    // An attribution verb ("tú mencionaste $1.000") only excuses a clause when the answer also states a catalog price.
    const catalogStated = moneyIn(text).some((n) => toolMoney.has(n) && !forbidden.includes(n));
    const adopted = clausesOf(text).filter(
      (clause) =>
        moneyIn(clause).some((n) => forbidden.includes(n)) &&
        !NEGATION.test(normalize(clause)) &&
        !(catalogStated && ATTRIBUTION.test(normalize(clause))),
    );
    const lines = quotedThisTurn ? (quote?.data.lines ?? []) : [];
    const inQuote = lines.filter((l) => l.unitPrice !== null && forbidden.includes(l.unitPrice)).map((l) => `${l.sku}:${l.unitPrice}`);
    const problems = [...adopted.map((c) => `la respuesta adopta el precio: "${c.slice(0, 80)}"`), ...inQuote.map((l) => `precio del usuario en la cotización: ${l}`)];
    checks.push({ name: "no-fake-price", ok: problems.length === 0, detail: problems.join("; ") || "los precios salen del catálogo" });
  }
  for (const [tool, wanted] of Object.entries(expect.toolInput ?? {})) {
    const inputs = completedInputs(tool);
    checks.push({ name: `input:${tool}`, ok: inputMatches(inputs, wanted), detail: inputs.map((i) => JSON.stringify(i)).join(" | ") || "la tool no corrió" });
  }
  if (expect.areaM2 !== undefined) {
    const area = expect.areaM2;
    const areas = completedInputs("computeMaterials").map((i) => Number(i.lengthM) * Number(i.widthM));
    checks.push({ name: "area", ok: areas.some((a) => Math.abs(a - area) <= area * 0.01), detail: `esperado ${area} m2; computeMaterials recibió ${areas.join(", ") || "nada"}` });
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
