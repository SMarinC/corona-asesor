import { tool } from "ai";
import { z } from "zod";
import { searchTiles } from "@/lib/domain/search";
import type { ToolDeps } from "./deps";
import { DESIGN_LABEL_KEYS, DESIGN_LABELS, FINISH_LABELS } from "./labels";
import { ok, runTool, toModelOutput, type ToolResult } from "./result";
import { summarizeTile, type TileSummary } from "./summaries";

export const searchTilesInput = z.object({
  surface: z.enum(["floor", "wall"]).optional().describe("floor = piso, wall = pared."),
  environment: z.enum(["indoor", "outdoor"]).optional().describe("indoor = interior, outdoor = exterior."),
  wetArea: z.boolean().optional().describe("true si es zona húmeda (baño, cocina, exterior descubierto)."),
  finish: z.enum(FINISH_LABELS).optional(),
  design: z.enum(DESIGN_LABEL_KEYS).optional().describe("Estilo de diseño canónico."),
  color: z.string().min(2).max(40).optional().describe("Color que aparece en el nombre, p. ej. 'blanco', 'gris'."),
  maxPricePerBox: z.number().positive().optional().describe("Precio máximo por caja en COP, solo si el cliente da un precio por caja. Nunca uses aquí el presupuesto total del proyecto."),
  limit: z.number().int().min(1).max(10).optional().describe("Máximo de resultados (por defecto 6)."),
});
export type SearchTilesInput = z.infer<typeof searchTilesInput>;

export interface TileResult extends TileSummary {
  matchScore: number;
  /** Requested attributes the catalog does not state for this tile. */
  unknown: string[];
}

export interface SearchTilesData {
  results: TileResult[];
  note: string;
}

export function executeSearchTiles(deps: ToolDeps, input: SearchTilesInput): ToolResult<SearchTilesData> {
  const { limit = 6, design, maxPricePerBox, ...filters } = input;
  const ranked = searchTiles(
    deps.catalog.tiles,
    { ...filters, design: design ? DESIGN_LABELS[design] : undefined, maxPrice: maxPricePerBox },
    limit,
  );
  return ok({
    results: ranked.map((r) => ({ ...summarizeTile(r.product), matchScore: r.score, unknown: r.unknown })),
    note:
      ranked.length === 0
        ? "Sin resultados: prueba quitando diseño, color, acabado o precio máximo."
        : "Precios por caja. 'unknown' lista atributos que el catálogo no declara para ese producto: menciónalo como 'Requiere revisión'.",
  });
}

export const createSearchTilesTool = (deps: ToolDeps) =>
  tool({
    description:
      "Busca revestimientos (pisos y paredes) en stock en el catálogo según las condiciones del proyecto. Ordena por cuántos filtros cumple; los atributos que el catálogo no declara no excluyen el producto pero se marcan en 'unknown'.",
    inputSchema: searchTilesInput,
    execute: (input) => runTool("searchTiles", () => executeSearchTiles(deps, input)),
    toModelOutput,
  });
