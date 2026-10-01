import { tool } from "ai";
import { z } from "zod";
import { searchAdhesives, searchGrouts } from "@/lib/domain/search";
import type { ToolDeps } from "./deps";
import { TILE_MATERIALS } from "./labels";
import { ok, runTool, toModelOutput, type ToolResult } from "./result";
import { type AdhesiveSummary, type GroutSummary, summarizeAdhesive, summarizeGrout } from "./summaries";

export const searchSuppliesInput = z.object({
  kind: z.enum(["adhesive", "grout"]).describe("adhesive = pegante, grout = boquilla."),
  tileMaterial: z.enum(TILE_MATERIALS).optional().describe("Material del revestimiento (solo pegantes)."),
  outdoor: z.boolean().optional().describe("true si la instalación es exterior (solo pegantes)."),
  jointWidthMm: z.number().positive().max(30).optional().describe("Ancho de junta en mm (solo boquillas)."),
  color: z.string().min(2).max(40).optional().describe("Color en el nombre (solo boquillas)."),
  limit: z.number().int().min(1).max(10).optional().describe("Máximo de resultados (por defecto 5)."),
});
export type SearchSuppliesInput = z.infer<typeof searchSuppliesInput>;

type Ranking = { matchScore: number; unknown: string[] };
export type SupplyResult = (AdhesiveSummary & Ranking) | (GroutSummary & Ranking);

export interface SearchSuppliesData {
  kind: SearchSuppliesInput["kind"];
  results: SupplyResult[];
  /** Filters sent for the other kind; reported instead of silently dropped. */
  ignoredFilters: string[];
}

const ADHESIVE_ONLY = ["tileMaterial", "outdoor"] as const;
const GROUT_ONLY = ["jointWidthMm", "color"] as const;

export function executeSearchSupplies(deps: ToolDeps, input: SearchSuppliesInput): ToolResult<SearchSuppliesData> {
  const { kind, limit = 5 } = input;
  const ignoredFilters = (kind === "adhesive" ? GROUT_ONLY : ADHESIVE_ONLY).filter((key) => input[key] !== undefined);
  const results: SupplyResult[] =
    kind === "adhesive"
      ? searchAdhesives(deps.catalog.adhesives, { tileMaterial: input.tileMaterial, outdoor: input.outdoor }, limit).map((r) => ({
          ...summarizeAdhesive(r.product),
          matchScore: r.score,
          unknown: r.unknown,
        }))
      : searchGrouts(deps.catalog.grouts, { jointWidthMm: input.jointWidthMm, color: input.color }, limit).map((r) => ({
          ...summarizeGrout(r.product),
          matchScore: r.score,
          unknown: r.unknown,
        }));
  return ok({ kind, results, ignoredFilters });
}

export const createSearchSuppliesTool = (deps: ToolDeps) =>
  tool({
    description:
      "Busca pegantes (filtra por material del revestimiento según la ficha y por uso exterior) o boquillas (filtra por rango de junta de la ficha y color; nunca ofrece productos de reparación). Cada compatibilidad trae el citationId del fragmento que la respalda.",
    inputSchema: searchSuppliesInput,
    execute: (input) => runTool("searchSupplies", () => executeSearchSupplies(deps, input)),
    toModelOutput,
  });
