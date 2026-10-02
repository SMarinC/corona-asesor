import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { CompatibilityData } from "@/lib/agent/tools/check-compatibility";
import type { AdhesiveQuantity, GroutQuantity, MaterialsData, TileQuantity } from "@/lib/agent/tools/compute-materials";
import type { QuoteData } from "@/lib/agent/tools/build-quote";
import type { MissingField } from "@/lib/agent/tools/result";
import { summarizeTile, type TileSummary } from "@/lib/agent/tools/summaries";
import type { AreaResult } from "@/lib/domain/calculations";
import { citationIdsIn } from "./citations";
import { isToolPart, isToolPartOf, type ToolName } from "./tool-parts";

export interface ProjectSpace extends AreaResult {
  lengthM: number;
  widthM: number;
}

export interface ProjectConditionsView {
  surface: "floor" | "wall";
  environment: "indoor" | "outdoor";
  wetArea: boolean;
  traffic: "low" | "medium" | "high" | null;
  jointWidthMm: number | null;
}

export interface ProjectMaterials {
  tile: TileQuantity | null;
  adhesive: AdhesiveQuantity | null;
  grout: GroutQuantity | null;
}

/** How a quote line's quantity relates to what computeMaterials returned for that SKU. */
export type LineCheck = "computed" | "differs" | "not_computed";

export interface ProjectQuote {
  data: Partial<QuoteData>;
  needsReview: boolean;
  /** True when a computeMaterials call completed after this quote, so the quote may no longer match the latest numbers. */
  stale: boolean;
  /** Keyed by SKU. A quantity the calculator never produced is shown as needing review, never as a fact. */
  lineChecks: Record<string, LineCheck>;
}

export interface ReviewItem {
  tool: ToolName;
  field: string;
  reason: string;
}

export interface ProjectState {
  space: ProjectSpace | null;
  conditions: ProjectConditionsView | null;
  /** The tile the agent is working with: the last one sent to computeMaterials or checkCompatibility. */
  tile: TileSummary | null;
  materials: ProjectMaterials | null;
  compatibility: CompatibilityData | null;
  quote: ProjectQuote | null;
  review: ReviewItem[];
  /** Every citation id returned by a tool in this conversation. */
  citations: string[];
  toolCalls: number;
}

export const EMPTY_PROJECT: ProjectState = {
  space: null,
  conditions: null,
  tile: null,
  materials: null,
  compatibility: null,
  quote: null,
  review: [],
  citations: [],
  toolCalls: 0,
};

const reviewFrom = (tool: ToolName, missing: MissingField[]): ReviewItem[] => missing.map((m) => ({ tool, field: m.field, reason: m.reason }));

/**
 * The "Tu proyecto" panel is a pure function of the tool outputs in the conversation, so it can only ever show
 * what a tool computed. Later calls replace earlier ones of the same tool.
 */
export function deriveProject(messages: CoronaUIMessage[]): ProjectState {
  const tiles = new Map<string, TileSummary>();
  const citations = new Set<string>();
  let state: ProjectState = { ...EMPTY_PROJECT };
  let tileSku: string | null = null;
  let materialsReview: ReviewItem[] = [];
  let quoteReview: ReviewItem[] = [];
  let toolCalls = 0;
  let compatibilityReview: ReviewItem[] = [];
  // Calculations completed since the previous quote, and the set the latest quote is checked against.
  // A later call for the same tile replaces the earlier one (last call wins); different tiles accumulate.
  let pending: { tileSku: string; data: Partial<MaterialsData> }[] = [];
  let quoteCalcs: Partial<MaterialsData>[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      toolCalls += 1;
      if (part.state !== "output-available") continue;
      for (const id of citationIdsIn(part.output)) citations.add(id);

      if (isToolPartOf(part, "searchTiles") && part.output.status === "ok") {
        for (const tile of part.output.data.results) tiles.set(tile.sku, tile);
      } else if (isToolPartOf(part, "getProduct") && part.output.status === "ok") {
        const { product } = part.output.data;
        if (product.kind === "tile") tiles.set(product.sku, summarizeTile(product));
      } else if (isToolPartOf(part, "computeMaterials") && part.output.status !== "error") {
        const output = part.output;
        const data: Partial<MaterialsData> = output.data;
        tileSku = part.input.tileSku;
        if (data.area) state = { ...state, space: { ...data.area, lengthM: part.input.lengthM, widthM: part.input.widthM } };
        state = { ...state, materials: { tile: data.tile ?? null, adhesive: data.adhesive ?? null, grout: data.grout ?? null } };
        pending = [...pending.filter((call) => call.tileSku !== part.input.tileSku), { tileSku: part.input.tileSku, data }];
        materialsReview = output.status === "needs_review" ? reviewFrom("computeMaterials", output.missing) : [];
      } else if (isToolPartOf(part, "checkCompatibility") && part.output.status === "ok") {
        const { data } = part.output;
        tileSku = data.products.tile.sku;
        compatibilityReview = data.checks
          .filter((check) => check.verdict === "needs_review")
          .map((check) => ({ tool: "checkCompatibility", field: `check:${check.rule}`, reason: check.message }));
        state = {
          ...state,
          compatibility: data,
          conditions: {
            surface: data.project.surface,
            environment: data.project.environment,
            wetArea: data.project.wetArea,
            traffic: data.project.traffic,
            jointWidthMm: data.project.jointWidthMm ?? null,
          },
        };
      } else if (isToolPartOf(part, "buildQuote") && part.output.status !== "error") {
        const output = part.output;
        state = { ...state, quote: { data: output.data, needsReview: output.status === "needs_review", stale: false, lineChecks: {} } };
        // A quote is checked against the calculations since the previous quote; a re-quote with none keeps the previous set.
        if (pending.length > 0) quoteCalcs = pending.map((call) => call.data);
        pending = [];
        quoteReview = output.status === "needs_review" ? reviewFrom("buildQuote", output.missing) : [];
      }
    }
  }

  const quote = state.quote ? { ...withLineChecks(state.quote, quoteCalcs), stale: pending.length > 0 } : null;
  const staleReview: ReviewItem[] = quote?.stale
    ? [{ tool: "buildQuote", field: "stale", reason: "La cotización es anterior al último cálculo de materiales; pide una nueva cotización." }]
    : [];
  const lineReview: ReviewItem[] = [];
  for (const line of quote?.data.lines ?? []) {
    const check = quote?.lineChecks[line.sku];
    if (check === "not_computed") {
      lineReview.push({ tool: "buildQuote", field: `quantity:${line.sku}`, reason: `La cantidad de ${line.name} no salió del cálculo de materiales.` });
    } else if (check === "differs") {
      lineReview.push({ tool: "buildQuote", field: `quantity:${line.sku}`, reason: `La cantidad de ${line.name} no coincide con el cálculo de materiales.` });
    }
  }

  return {
    ...state,
    quote,
    tile: tileSku ? (tiles.get(tileSku) ?? null) : null,
    review: [...materialsReview, ...compatibilityReview, ...quoteReview, ...staleReview, ...lineReview],
    citations: [...citations],
    toolCalls,
  };
}

function withLineChecks(quote: ProjectQuote, calcs: Partial<MaterialsData>[]): ProjectQuote {
  const computed = new Map<string, number[]>();
  const add = (sku: string, value: number) => computed.set(sku, [...(computed.get(sku) ?? []), value]);
  for (const calc of calcs) {
    if (calc.tile) add(calc.tile.sku, calc.tile.boxes);
    if (calc.adhesive) add(calc.adhesive.sku, calc.adhesive.bags);
    if (calc.grout) add(calc.grout.sku, calc.grout.units);
  }
  const lineChecks: Record<string, LineCheck> = {};
  for (const line of quote.data.lines ?? []) {
    const values = computed.get(line.sku);
    const sum = values?.reduce((a, b) => a + b, 0);
    lineChecks[line.sku] = values === undefined ? "not_computed" : values.includes(line.quantity) || sum === line.quantity ? "computed" : "differs";
  }
  return { ...quote, lineChecks };
}
