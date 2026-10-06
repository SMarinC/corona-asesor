import { tool } from "ai";
import { z } from "zod";
import type { SheetHit } from "@/lib/data/sheets";
import type { ToolDeps } from "./deps";
import { ok, runTool, toolError, type ToolResult } from "./result";

export const MAX_HIT_CHARS = 4_000;
export const MAX_HIT_SKUS = 10;

export const searchTechnicalSheetsInput = z.object({
  query: z.string().min(3).max(200).describe("Qué buscar, p. ej. 'm2 por caja', 'rendimiento kg/m2', 'ancho de junta'."),
  sku: z.string().min(1).max(20).optional().describe("Limita la búsqueda a la ficha de este SKU."),
  k: z.number().int().min(1).max(6).optional().describe("Número de fragmentos (por defecto 3)."),
});
export type SearchTechnicalSheetsInput = z.infer<typeof searchTechnicalSheetsInput>;

export interface SheetHitData {
  citationId: string;
  section: string;
  docType: string;
  /** First MAX_HIT_SKUS SKUs whose sheet contains this fragment. */
  skus: string[];
  skuCount: number;
  text: string;
  truncated: boolean;
  score: number;
}

export interface SearchTechnicalSheetsData {
  /** "keyword" means the embedding call failed (often free-tier quota) and results are lexical. */
  mode: "semantic" | "keyword";
  hits: SheetHitData[];
  note: string;
}

export function toHitData({ chunk, score }: SheetHit): SheetHitData {
  const truncated = chunk.text.length > MAX_HIT_CHARS;
  return {
    citationId: chunk.citationId,
    section: chunk.section,
    docType: chunk.docType,
    skus: chunk.skus.slice(0, MAX_HIT_SKUS),
    skuCount: chunk.skus.length,
    text: truncated ? `${chunk.text.slice(0, MAX_HIT_CHARS)}…` : chunk.text,
    truncated,
    score,
  };
}

export async function executeSearchTechnicalSheets(
  deps: ToolDeps,
  input: SearchTechnicalSheetsInput,
): Promise<ToolResult<SearchTechnicalSheetsData>> {
  if (input.sku !== undefined && !deps.catalog.get(input.sku)) {
    return toolError("unknown_sku", `El SKU ${input.sku} no existe en el catálogo.`);
  }
  const sku = input.sku === undefined ? undefined : deps.catalog.get(input.sku)?.sku;
  const { mode, hits } = await deps.sheets.search(input.query, { sku, k: input.k ?? 3 });
  return ok({
    mode,
    hits: hits.map(toHitData),
    note: "Cita los datos con su citationId entre corchetes, p. ej. [c0170]. Para usar un valor en computeMaterials pásalo como { value, citationId }.",
  });
}

export const createSearchTechnicalSheetsTool = (deps: ToolDeps) =>
  tool({
    description:
      "Busca fragmentos de las fichas técnicas (rendimientos, m² por caja, juntas, usos, restricciones). Cada fragmento trae un citationId para citarlo o para pasar un valor verificable a computeMaterials.",
    inputSchema: searchTechnicalSheetsInput,
    execute: (input) => runTool("searchTechnicalSheets", () => executeSearchTechnicalSheets(deps, input)),
  });
