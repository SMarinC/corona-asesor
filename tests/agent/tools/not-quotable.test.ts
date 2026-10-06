import { describe, expect, it } from "vitest";
import { executeBuildQuote } from "@/lib/agent/tools/build-quote";
import { executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { executeGetProduct } from "@/lib/agent/tools/get-product";
import { executeSearchTiles } from "@/lib/agent/tools/search-tiles";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const deps = makeToolDeps();
const rejection = {
  status: "error",
  code: "not_quotable",
  message: "El producto Piso Sin Caja Gris 60x60 (SKU T5) no tiene en el catálogo los m² por caja; no se puede cotizar con este asesor.",
};

describe("a tile without m² per box in the company data", () => {
  it("is never offered by searchTiles", () => {
    const result = executeSearchTiles(deps, { surface: "floor", limit: 10 });
    expect(result.status === "ok" && result.data.results.map((r) => r.sku)).not.toContain("T5");
  });

  it("is rejected with the reason by getProduct, computeMaterials and buildQuote", () => {
    expect(executeGetProduct(deps, { sku: "T5" })).toEqual(rejection);
    expect(executeComputeMaterials(deps, { lengthM: 3, widthM: 2, tileSku: "T5" })).toEqual(rejection);
    expect(executeBuildQuote(deps, { lines: [{ sku: "T5", quantity: 4 }] })).toEqual(rejection);
  });
});
