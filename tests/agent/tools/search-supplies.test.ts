import { describe, expect, it } from "vitest";
import { executeSearchSupplies, searchSuppliesInput } from "@/lib/agent/tools/search-supplies";
import { getToolDeps } from "@/lib/agent/tools";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const deps = makeToolDeps();

function okData(result: ReturnType<typeof executeSearchSupplies>) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result.data;
}

describe("searchSupplies tool", () => {
  it("drops adhesives whose sheet excludes the tile material and flags unknown ones", () => {
    const data = okData(executeSearchSupplies(deps, { kind: "adhesive", tileMaterial: "porcelain" }));
    expect(data.results.map((r) => r.sku)).toEqual(["A2"]);
    expect(data.results[0]).toMatchObject({ priceUnit: "bulto", unknown: ["tileMaterial"] });
  });

  it("ranks verified adhesives first", () => {
    const data = okData(executeSearchSupplies(deps, { kind: "adhesive", tileMaterial: "ceramic", outdoor: true }));
    expect(data.results.map((r) => r.sku)).toEqual(["A1", "A2"]);
    expect(data.results[0]).toMatchObject({ compatibilityCitationId: "c0001", bagKg: 25 });
  });

  it("filters grouts by joint width and never offers repair products", () => {
    const fits = okData(executeSearchSupplies(deps, { kind: "grout", jointWidthMm: 3 }));
    expect(fits.results.map((r) => r.sku)).toEqual(["G1"]);
    expect(fits.results[0]).toMatchObject({ priceUnit: "unidad", jointMm: { min: 1, max: 5 }, jointCitationId: "c0002" });
    expect(okData(executeSearchSupplies(deps, { kind: "grout", jointWidthMm: 8 })).results).toEqual([]);
  });

  it("reports filters that do not apply to the requested kind", () => {
    expect(okData(executeSearchSupplies(deps, { kind: "adhesive", jointWidthMm: 3 })).ignoredFilters).toEqual(["jointWidthMm"]);
    expect(okData(executeSearchSupplies(deps, { kind: "grout", tileMaterial: "ceramic" })).ignoredFilters).toEqual(["tileMaterial"]);
  });

  it("requires a kind", () => {
    expect(searchSuppliesInput.safeParse({ tileMaterial: "ceramic" }).success).toBe(false);
  });
});

describe("searchSupplies on the real catalog", () => {
  it("names each adhesive with its bag size from the catalog, so same-name SKUs stay distinct", () => {
    // The stage-4 search for a ceramic tile; two SKUs are both called "PEGACOR® Interiores Gris" (10 kg and 25 kg bags).
    const data = okData(executeSearchSupplies(getToolDeps(), { kind: "adhesive", tileMaterial: "ceramic", limit: 10 }));
    const name = (sku: string) => data.results.find((r) => r.sku === sku)?.name;
    expect(name("901061501")).toBe("PEGACOR® Interiores Gris · 10 kg");
    expect(name("901021501")).toBe("PEGACOR® Interiores Gris · 25 kg");
    expect(new Set(data.results.map((r) => r.name)).size).toBe(data.results.length);
    // A name that already states its weight is left alone.
    expect(name("901521501")).toBe("PEGACOR® Ultra Gel Gris 25 kg");
  });
});
