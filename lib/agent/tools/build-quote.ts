import { tool } from "ai";
import { z } from "zod";
import { checkQuoteQuantities } from "@/lib/domain/quantity-check";
import { buildQuote, type Quote, type QuoteLine, type QuoteLineInput } from "@/lib/domain/quote";
import type { ToolDeps } from "./deps";
import { type MissingField, needsReview, ok, runTool, type ToolResult, toolError } from "./result";
import { PRICE_UNIT } from "./summaries";

export const buildQuoteInput = z.object({
  lines: z
    .array(z.object({ sku: z.string().min(1).max(20), quantity: z.number().int().positive().max(10_000) }))
    .min(1)
    .max(12)
    .describe("Productos y cantidades: normalmente las cajas, bultos y unidades que calculó computeMaterials. Los precios los pone el catálogo."),
  budget: z.number().positive().optional().describe("Presupuesto del usuario en COP."),
  projectSummary: z.string().max(300).optional().describe("Resumen corto del proyecto para el encabezado de la cotización."),
  includeLinks: z.boolean().optional().describe("Incluir el enlace de cada producto (por defecto true)."),
});
export type BuildQuoteInput = z.infer<typeof buildQuoteInput>;

export interface QuoteLineData extends QuoteLine {
  unit: (typeof PRICE_UNIT)[keyof typeof PRICE_UNIT];
}

export interface QuoteData extends Omit<Quote, "lines"> {
  lines: QuoteLineData[];
  currency: "COP";
  projectSummary: string | null;
  /** SKUs the model listed more than once; their quantities were added up. */
  mergedDuplicates: string[];
  priceNote: string;
}

const PRICE_NOTE = "Precios del snapshot del catálogo público de Corona usado en la competencia; pueden diferir de los actuales.";

export function mergeDuplicateLines(lines: QuoteLineInput[]): { lines: QuoteLineInput[]; duplicates: string[] } {
  const quantities = new Map<string, number>();
  const duplicates = new Set<string>();
  for (const line of lines) {
    if (quantities.has(line.sku)) duplicates.add(line.sku);
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
  }
  return { lines: [...quantities].map(([sku, quantity]) => ({ sku, quantity })), duplicates: [...duplicates] };
}

export function executeBuildQuote(deps: ToolDeps, input: BuildQuoteInput): ToolResult<QuoteData> {
  const merged = mergeDuplicateLines(input.lines);
  const result = buildQuote(merged.lines, (sku) => deps.catalog.get(sku), input.budget ?? null);
  if (!result.ok) return toolError("unknown_sku", `SKU que no existen en el catálogo: ${result.unknownSkus.join(", ")}.`);

  const includeLinks = input.includeLinks ?? true;
  const { quote } = result;
  const data: QuoteData = {
    ...quote,
    lines: quote.lines.map((line) => ({ ...line, unit: PRICE_UNIT[line.kind], url: includeLinks ? line.url : null })),
    currency: "COP",
    projectSummary: input.projectSummary ?? null,
    mergedDuplicates: merged.duplicates,
    priceNote: PRICE_NOTE,
  };
  const missing: MissingField[] = quote.missingPrices.map((sku) => ({
    field: `price:${sku}`,
    reason: `El catálogo no tiene precio para ${sku}; el total no lo incluye.`,
  }));
  if (deps.quantities) missing.push(...quantityFlags(data.lines, checkQuoteQuantities(deps.quantities.takeForQuote(), merged.lines)));
  return missing.length > 0 ? needsReview(data, missing) : ok(data);
}

/** Lines whose quantity no computeMaterials call produced: the quote is still priced, but the model must say so. */
function quantityFlags(lines: QuoteLineData[], checks: ReturnType<typeof checkQuoteQuantities>): MissingField[] {
  return lines.flatMap((line) => {
    const check = checks[line.sku];
    if (check === "computed") return [];
    const why = check === "differs" ? "no coincide con el último cálculo de computeMaterials" : "no salió de computeMaterials";
    return [{ field: `quantity:${line.sku}`, reason: `La cantidad de ${line.name} (${line.quantity}) ${why}: preséntala como "Requiere revisión" o calcula los materiales antes de cotizar.` }];
  });
}

export const createBuildQuoteTool = (deps: ToolDeps) =>
  tool({
    description:
      "Arma la cotización final con precios del catálogo (nunca acepta precios externos): subtotales, total y comparación con el presupuesto. Usa las cantidades exactas que calculó computeMaterials.",
    inputSchema: buildQuoteInput,
    execute: (input) => runTool("buildQuote", () => executeBuildQuote(deps, input)),
  });
