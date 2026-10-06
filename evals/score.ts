import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { QuoteLineData } from "@/lib/agent/tools/build-quote";
import type { Catalog } from "@/lib/data/catalog";
import { deriveProject } from "@/lib/ui/derive-project";
import { type CoronaToolPart, isToolPart, isToolPartOf, type ToolName, toolFailed, toolNameOf, toolPhase } from "@/lib/ui/tool-parts";
import type { ScenarioExpect } from "./scenarios";
import { answerOf, traceOf } from "./trace";

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

/** How a turn ended: it answered (a turn cut at the step cap still answers), it ran out of time, or it failed. */
export type Outcome = "ok" | "timeout" | "error";

export interface TurnMetrics {
  outcome: Outcome;
  steps: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Peso amounts in the answer that no tool returned and the customer never stated. */
  moneyNotFromTools: number[];
  /** Quote lines whose quantity did not come from computeMaterials, as "sku:check". */
  inventedQuantities: string[];
}

export interface TurnInput {
  /** The whole conversation up to and including this turn's assistant message. */
  messages: CoronaUIMessage[];
  turnLog: TurnLog | null;
  /** A stream error code (e.g. quota_exhausted) or an HTTP rejection, if the turn failed. */
  error: string | null;
  /** The turn must ask the customer for the missing data instead of answering. */
  asks?: boolean;
  /** Every quote line's unit price must be this catalog's price. */
  catalog: Pick<Catalog, "get">;
}

/** The spec's step budget for one turn; the agent's hard cap (MAX_STEPS) is higher. */
const MAX_TURN_STEPS = 7;

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** getCompanyInfo answers questions about the company; every other tool reads the product catalog. */
const isCatalogTool = (tool: ToolName) => tool !== "getCompanyInfo";

const toolPartsOf = (messages: CoronaUIMessage[]) => messages.flatMap((m) => (m.role === "assistant" ? m.parts.filter(isToolPart) : []));

/** A call that finished without failing; an incompatible or needs_review result still ran. */
const succeeded = (part: CoronaToolPart) => part.state === "output-available" && !toolFailed(part);

const quoteLinesOf = (parts: CoronaToolPart[]): QuoteLineData[] =>
  parts.flatMap((p) => (isToolPartOf(p, "buildQuote") && p.state === "output-available" && p.output.status !== "error" ? (p.output.data.lines ?? []) : []));

const outcomeOf = (turnLog: TurnLog | null, error: string | null): Outcome => {
  if (turnLog?.outcome === "timeout") return "timeout";
  return error === null && (turnLog?.outcome === "ok" || turnLog?.outcome === "step_cap") ? "ok" : "error";
};

/** A markdown list marker at the start of a line: "- ", "1. ", "1) ", "**1.** ", or a bullet before a number ("- **2.** "). */
const LIST_MARKER = /^\s*(?:[-*+]\s+)?(?:(?:\*\*|__)?\d+[.)](?:\*\*|__)?\s)?/gm;

/** Numbers stated in prose ("1.500.000", "6,6", "3 x 2"), outside URLs and list markers; digits glued to letters ("m2", "60x120") are labels. */
function numbersIn(text: string): string[] {
  const prose = text.replace(/https?:\/\/\S+/g, " ").replace(LIST_MARKER, " ");
  return [...prose.matchAll(/(?<![\p{L}\d.,])\d+(?:[.,]\d+)*(?![\p{L}\d])/gu)].map((m) => m[0]);
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

/** The exact peso values tools returned (unit prices, subtotals, totals, budget, difference), plus their absolute values. */
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

/** The answer asks the customer for something: a question (? or ¿) or an explicit data request. */
const asksForData = (text: string): boolean => /[?¿]/.test(text) || DATA_REQUEST.test(normalize(text));

/** The checks every turn gets, plus `asks` when the scenario expects a question back. */
export function scoreTurn({ messages, turnLog, error, asks, catalog }: TurnInput): { checks: Check[]; metrics: TurnMetrics } {
  const assistant = messages.at(-1)!;
  const answer = answerOf(assistant);
  const turnParts = assistant.parts.filter(isToolPart);
  const outcome = outcomeOf(turnLog, error);
  const steps = turnLog?.steps ?? 0;

  const outputs = toolPartsOf(messages).flatMap((p) => (p.state === "output-available" ? [p.output] : []));
  const toolMoney = toolMoneyValues(outputs);
  const customerMoney = new Set(messages.filter((m) => m.role === "user").flatMap((m) => moneyIn(answerOf(m))));
  const moneyNotFromTools = moneyIn(answer).filter((n) => !toolMoney.has(n) && !customerMoney.has(n));

  const lines = quoteLinesOf(turnParts);
  // The panel's own ledger over the whole conversation: the last quote is this turn's.
  const lineChecks = lines.length > 0 ? (deriveProject(messages).quote?.lineChecks ?? {}) : {};
  const inventedQuantities = Object.entries(lineChecks).filter(([, check]) => check !== "computed").map(([sku, check]) => `${sku}:${check}`);
  const wrongPrices = lines.flatMap((line) => {
    const price = catalog.get(line.sku)?.price ?? null;
    return line.unitPrice === price ? [] : [`${line.sku}: ${line.unitPrice} en la cotización, ${price} en el catálogo`];
  });
  const needsReview = turnParts.some((p) => toolPhase(p) === "review");

  const checks: Check[] = [
    { name: "completed", ok: outcome === "ok", detail: error ?? turnLog?.outcome ?? "sin línea chat_turn" },
    { name: "steps", ok: steps <= MAX_TURN_STEPS, detail: `${steps} pasos (máx. ${MAX_TURN_STEPS})` },
    { name: "money-from-tools", ok: moneyNotFromTools.length === 0, detail: moneyNotFromTools.length ? `montos que no salieron de una tool ni del cliente: ${moneyNotFromTools.join(", ")}` : "ok" },
    { name: "quantities-computed", ok: inventedQuantities.length === 0, detail: inventedQuantities.join(", ") || "ok" },
    { name: "catalog-prices", ok: wrongPrices.length === 0, detail: wrongPrices.join("; ") || "ok" },
    { name: "review", ok: !needsReview || normalize(answer).includes("requiere revision"), detail: needsReview ? "una tool pidió revisión" : "nada que revisar" },
  ];
  if (asks) {
    const catalogCalls = turnParts.map(toolNameOf).filter(isCatalogTool);
    const numbers = numbersIn(answer);
    const problem = catalogCalls.length
      ? `llamó ${catalogCalls.join(", ")}`
      : numbers.length
        ? `escribió números: ${numbers.join(", ")}`
        : asksForData(answer)
          ? null
          : `no pide datos: "${answer.slice(0, 100)}"`;
    checks.push({ name: "asks", ok: problem === null, detail: problem ?? "pide los datos que faltan" });
  }

  return {
    checks,
    metrics: {
      outcome,
      steps,
      durationMs: turnLog?.durationMs ?? 0,
      inputTokens: turnLog?.inputTokens ?? 0,
      outputTokens: turnLog?.outputTokens ?? 0,
      moneyNotFromTools,
      inventedQuantities,
    },
  };
}

/** The scenario's own checks, run once over the whole conversation after its last turn. */
export function scoreScenario(messages: CoronaUIMessage[], expect: ScenarioExpect): Check[] {
  const parts = toolPartsOf(messages);
  const ran = (tool: ToolName) => parts.filter((p) => toolNameOf(p) === tool && succeeded(p));
  const trail = parts.map(toolNameOf).join(" → ") || "ninguna tool";
  const quote = deriveProject(messages).quote?.data;
  const checks: Check[] = [];

  for (const tool of expect.calls ?? []) checks.push({ name: `calls:${tool}`, ok: ran(tool).length > 0, detail: trail });
  for (const [tool, wanted] of Object.entries(expect.inputs ?? {}) as [ToolName, Record<string, unknown>][]) {
    const inputs = ran(tool).map((p) => p.input as Record<string, unknown>);
    const ok = inputs.some((input) => Object.entries(wanted).every(([key, value]) => input[key] === value));
    checks.push({ name: `input:${tool}`, ok, detail: inputs.map((i) => JSON.stringify(i)).join(" | ") || "la tool no corrió" });
  }
  if (expect.areaM2 !== undefined) {
    const area = expect.areaM2;
    const areas = ran("computeMaterials").map((p) => {
      const { lengthM, widthM } = p.input as { lengthM: number; widthM: number };
      return lengthM * widthM;
    });
    checks.push({ name: "area", ok: areas.some((a) => Math.abs(a - area) <= area * 0.01), detail: `esperado ${area} m2; computeMaterials recibió ${areas.join(", ") || "nada"}` });
  }
  if (expect.quote) {
    checks.push({
      name: `quote:${expect.quote}`,
      ok: quote?.withinBudget === (expect.quote === "within"),
      detail: quote ? `total ${quote.total}, withinBudget ${String(quote.withinBudget)}` : "sin cotización",
    });
  }
  if (expect.quoteMentions) {
    const quoting = messages.findLast((m) => m.role === "assistant" && m.parts.some((p) => isToolPartOf(p, "buildQuote") && succeeded(p)));
    const said = normalize(quoting ? answerOf(quoting) : "");
    const hit = expect.quoteMentions.find((phrase) => said.includes(normalize(phrase)));
    checks.push({ name: "quote-mentions", ok: hit !== undefined, detail: hit ?? (quoting ? `ninguna de: ${expect.quoteMentions.join(" | ")}` : "sin cotización") });
  }
  if (expect.resolvesSku) {
    const sku = expect.resolvesSku;
    const detours = messages.flatMap((m) => (m.role === "assistant" ? traceOf(m) : [])).filter((step) => step.error === "unknown_sku").length;
    const quoted = quote?.lines?.some((line) => line.sku === sku) ?? false;
    const ok = quoted && detours === 0;
    checks.push({ name: `resolves:${sku}`, ok, detail: ok ? "ok" : `${quoted ? "cotizado" : "no cotizado"}; ${detours} llamadas con unknown_sku` });
  }
  if (expect.link) {
    const link = expect.link;
    const catalogCalls = parts.map(toolNameOf).filter(isCatalogTool);
    const linked = messages.some((m) => m.role === "assistant" && answerOf(m).includes(link));
    const problem = catalogCalls.length ? `llamó ${catalogCalls.join(", ")}` : linked ? null : `sin el enlace ${link}`;
    checks.push({ name: "link", ok: problem === null, detail: problem ?? "ok" });
  }
  return checks;
}
