import { getCatalog } from "@/lib/data/catalog";
import { getCompanyContext } from "@/lib/data/company";
import { createGeminiEmbedQuery } from "@/lib/data/embed-query";
import { createSheetSearch, loadSheetArtifacts } from "@/lib/data/sheets";
import { createBuildQuoteTool } from "./build-quote";
import { createCheckCompatibilityTool } from "./check-compatibility";
import { createComputeMaterialsTool } from "./compute-materials";
import type { ToolDeps } from "./deps";
import { createGetCompanyInfoTool } from "./get-company-info";
import { createGetProductTool } from "./get-product";
import { createSearchSuppliesTool } from "./search-supplies";
import { createSearchTechnicalSheetsTool } from "./search-technical-sheets";
import { createSearchTilesTool } from "./search-tiles";

export const TOOL_NAMES = [
  "searchTiles",
  "searchSupplies",
  "getProduct",
  "searchTechnicalSheets",
  "computeMaterials",
  "checkCompatibility",
  "buildQuote",
  "getCompanyInfo",
] as const;

export function createTools(deps: ToolDeps) {
  return {
    searchTiles: createSearchTilesTool(deps),
    searchSupplies: createSearchSuppliesTool(deps),
    getProduct: createGetProductTool(deps),
    searchTechnicalSheets: createSearchTechnicalSheetsTool(deps),
    computeMaterials: createComputeMaterialsTool(deps),
    checkCompatibility: createCheckCompatibilityTool(deps),
    buildQuote: createBuildQuoteTool(deps),
    getCompanyInfo: createGetCompanyInfoTool(deps),
  };
}

export type CoronaTools = ReturnType<typeof createTools>;

let productionDeps: ToolDeps | null = null;

/** Loads the static artifacts once per server instance. */
export function getToolDeps(): ToolDeps {
  if (!productionDeps) {
    const { chunks, index } = loadSheetArtifacts();
    productionDeps = {
      catalog: getCatalog(),
      sheets: createSheetSearch({ chunks, index, embedQuery: createGeminiEmbedQuery() }),
      company: getCompanyContext(),
    };
  }
  return productionDeps;
}
