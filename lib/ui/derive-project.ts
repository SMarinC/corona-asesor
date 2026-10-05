import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { CompatibilityData } from "@/lib/agent/tools/check-compatibility";
import type { AdhesiveQuantity, GroutQuantity, MaterialsData, TileQuantity } from "@/lib/agent/tools/compute-materials";
import type { QuoteData } from "@/lib/agent/tools/build-quote";
import type { MissingField } from "@/lib/agent/tools/result";
import { summarizeTile, type TileSummary } from "@/lib/agent/tools/summaries";
import type { AreaResult } from "@/lib/domain/calculations";
import { type CalcQuantities, checkQuoteQuantities, createQuantityLedger, type LineCheck } from "@/lib/domain/quantity-check";
import { citationIdsIn } from "./citations";
import { tileMismatch } from "./project-view";
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

export type { LineCheck };

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
  // The same ledger buildQuote's server-side guard uses, so the panel and the tool agree on every line.
  const ledger = createQuantityLedger();
  let quoteCalcs: CalcQuantities[] = [];

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
        ledger.recordCalculation(part.input.tileSku, data);
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
        quoteCalcs = ledger.takeForQuote();
        quoteReview = output.status === "needs_review" ? reviewFrom("buildQuote", output.missing) : [];
      }
    }
  }

  const quote = state.quote
    ? { ...state.quote, lineChecks: checkQuoteQuantities(quoteCalcs, state.quote.data.lines ?? []), stale: ledger.hasPendingCalculations() }
    : null;
  const tileMismatchReview: ReviewItem[] = tileMismatch(state)
    ? [{ tool: "checkCompatibility", field: "tile_mismatch", reason: "La compatibilidad se verificó con otro revestimiento; pide verificar el revestimiento cotizado." }]
    : [];
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

  // The panel's own line checks win over the server's flag for the same line; a server flag the panel cannot
  // reproduce (the server saw a trimmed history) is kept, so the badge always has a reason.
  const lineFields = new Set(lineReview.map((item) => item.field));
  quoteReview = quoteReview.filter((item) => !(item.field.startsWith("quantity:") && lineFields.has(item.field)));

  return {
    ...state,
    quote,
    tile: tileSku ? (tiles.get(tileSku) ?? null) : null,
    review: [...materialsReview, ...compatibilityReview, ...tileMismatchReview, ...quoteReview, ...staleReview, ...lineReview],
    citations: [...citations],
    toolCalls,
  };
}
