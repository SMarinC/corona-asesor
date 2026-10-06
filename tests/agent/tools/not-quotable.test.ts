import { describe, expect, it } from "vitest";
import { executeBuildQuote } from "@/lib/agent/tools/build-quote";
import { executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { executeGetProduct } from "@/lib/agent/tools/get-product";
import { executeSearchSupplies } from "@/lib/agent/tools/search-supplies";
import { executeSearchTiles } from "@/lib/agent/tools/search-tiles";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const deps = makeToolDeps();
const rejection = {
  status: "error",
  code: "not_quotable",
  message: "El producto Piso Sin Caja Gris 60x60 (SKU T5) no tiene en el catálogo los m² por caja; no se puede cotizar con este asesor.",
};

describe("a tile without m² per box in the company data", () => {
  it("is never offered by searchTiles, while a tile with the data is", () => {
    const result = executeSearchTiles(deps, { surface: "floor", limit: 10 });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    const skus = result.data.results.map((r) => r.sku);
    expect(skus).toContain("T1");
    expect(skus).not.toContain("T5");
  });

  it("is rejected with the reason by getProduct, computeMaterials and buildQuote", () => {
    expect(executeGetProduct(deps, { sku: "T5" })).toEqual(rejection);
    expect(executeComputeMaterials(deps, { lengthM: 3, widthM: 2, tileSku: "T5" })).toEqual(rejection);
    expect(executeBuildQuote(deps, { lines: [{ sku: "T5", quantity: 4 }] })).toEqual(rejection);
  });

  it("is reported next to an unknown SKU when buildQuote gets both", () => {
    expect(executeBuildQuote(deps, { lines: [{ sku: "T5", quantity: 4 }, { sku: "ZZ9", quantity: 1 }] })).toEqual({
      ...rejection,
      message: `${rejection.message} SKU que no existen en el catálogo: ZZ9.`,
    });
  });
});

describe("supplies without the data their quantity needs", () => {
  const supply = (sku: string, name: string, missing: string) => ({
    status: "error",
    code: "not_quotable",
    message: `El producto ${name} (SKU ${sku}) no tiene en el catálogo ${missing}; no se puede cotizar con este asesor.`,
  });
  const room = { lengthM: 3, widthM: 2, tileSku: "T1", jointWidthMm: 3 };

  it("are never offered by searchSupplies, while supplies with the data are", () => {
    const skus = (kind: "adhesive" | "grout") => {
      const result = executeSearchSupplies(deps, { kind, limit: 10 });
      if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
      return result.data.results.map((r) => r.sku);
    };
    expect(skus("adhesive")).toContain("A1");
    expect(skus("adhesive")).not.toContain("A3");
    expect(skus("grout")).toContain("G1");
    expect(skus("grout")).not.toContain("G3");
  });

  it("are rejected with the reason by computeMaterials and buildQuote", () => {
    const adhesive = supply("A3", "PEGACOR® Sin Bulto Gris", "el peso del bulto");
    const grout = supply("G3", "Boquilla Sin Peso Gris", "el peso por unidad");
    expect(executeComputeMaterials(deps, { ...room, adhesiveSku: "A3" })).toEqual(adhesive);
    expect(executeComputeMaterials(deps, { ...room, groutSku: "G3" })).toEqual(grout);
    expect(executeBuildQuote(deps, { lines: [{ sku: "G3", quantity: 1 }] })).toEqual(grout);
  });
});
