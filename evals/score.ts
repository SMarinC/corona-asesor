import type { CoronaUIMessage } from "@/lib/agent/agent";
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

// A request for data worded without a question mark: "necesito que me compartas…", "compárteme…", "indícame…".
const DATA_REQUEST = /\bnecesito (?:que me|saber|conocer)\b|\b(?:compart|indic|conf[ií]rm|cu[eé]nt)(?:ame|eme)\b|\bdime\b|\bpor favor (?:comparte|indica|dime|confirma)\b/;

/** The answer asks the user for something: a question (? or ¿) or an explicit data request. */
export const asksForData = (text: string): boolean => /[?¿]/.test(text) || DATA_REQUEST.test(normalize(text));

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

  const toolMoney = toolMoneyValues(allOutputs);
  // A peso amount passes when a tool returned it or the user wrote it (their budget). A total derived from a price
  // the user made up matches neither source.
  const userMoney = new Set(userTexts.flatMap(moneyIn));
  const userOnlyMoney = moneyIn(text).filter((n) => !toolMoney.has(n) && !userMoney.has(n));

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
    { name: "money-from-tools", ok: userOnlyMoney.length === 0, detail: userOnlyMoney.length ? `montos que no salieron de una tool: ${userOnlyMoney.join(", ")}` : "ok" },
    { name: "quantities-computed", ok: quantityFlags.length === 0, detail: quantityFlags.length ? quantityFlags.join(", ") : "ok" },
    { name: "review", ok: !toolSaysReview || plain.includes("requiere revision"), detail: toolSaysReview ? "una tool pidió revisión" : "nada que revisar" },
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
    const lines = quotedThisTurn ? (quote?.data.lines ?? []) : [];
    const inQuote = lines.filter((l) => l.unitPrice !== null && forbidden.includes(l.unitPrice)).map((l) => `${l.sku}:${l.unitPrice}`);
    checks.push({ name: "no-fake-price", ok: inQuote.length === 0, detail: inQuote.length ? `precio del usuario en la cotización: ${inQuote.join(", ")}` : "los precios salen del catálogo" });
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
  if (expect.asks) checks.push({ name: "asks", ok: asksForData(text), detail: text.slice(0, 120) });
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
      quantityFlags,
    },
  };
}
