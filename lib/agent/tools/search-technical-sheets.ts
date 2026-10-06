import { tool } from "ai";
import { z } from "zod";
import type { SheetHit } from "@/lib/data/sheets";
import type { ToolDeps } from "./deps";
import { notOffered } from "./lookup";
import { ok, runTool, type ToolResult } from "./result";

export const MAX_HIT_CHARS = 4_000;
export const MAX_HIT_SKUS = 10;

export const searchTechnicalSheetsInput = z.object({
  query: z.string().min(3).max(200).describe("Qué buscar, p. ej. 'uso en exteriores', 'ancho de junta', 'tiempo de secado'."),
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
  const product = input.sku === undefined ? undefined : deps.catalog.get(input.sku);
  if (input.sku !== undefined && !product) return notOffered(deps, input.sku);
  const sku = product?.sku;
  const { mode, hits } = await deps.sheets.search(input.query, { sku, k: input.k ?? 3 });
  return ok({
    mode,
    hits: hits.map(toHitData),
    note: "Fragmentos para responder preguntas técnicas; las cantidades se calculan solo con los datos del catálogo.",
  });
}

export const createSearchTechnicalSheetsTool = (deps: ToolDeps) =>
  tool({
    description:
      "Busca fragmentos de las fichas técnicas para preguntas técnicas (usos, instalación, juntas, restricciones). Cada fragmento trae su citationId, que la interfaz muestra como cita.",
    inputSchema: searchTechnicalSheetsInput,
    execute: (input) => runTool("searchTechnicalSheets", () => executeSearchTechnicalSheets(deps, input)),
  });
