import { describe, expect, it } from "vitest";
import { searchAdhesives, searchGrouts, searchTiles } from "@/lib/domain/search";
import { makeAdhesive, makeGrout, makeTile } from "@/tests/fixtures/products";

describe("searchTiles", () => {
  const tiles = [
    makeTile({ sku: "cheap-unknown", price: 30000, indoor: null, outdoor: null, wetArea: null }),
    makeTile({ sku: "match", price: 90000 }),
    makeTile({ sku: "dry-only", price: 20000, wetArea: false }),
    makeTile({ sku: "wall", surface: "wall" }),
    makeTile({ sku: "gone", inStock: false }),
  ];

  it("ranks by filter fit, not by lowest price", () => {
    const result = searchTiles(tiles, { surface: "floor", environment: "indoor", wetArea: true });
    expect(result.map((r) => r.product.sku)).toEqual(["match", "cheap-unknown"]);
  });

  it("keeps unknown products but reports what is unknown", () => {
    const unknown = searchTiles(tiles, { surface: "floor", wetArea: true }).find((r) => r.product.sku === "cheap-unknown");
    expect(unknown?.unknown).toEqual(["wetArea"]);
  });

  it("excludes known mismatches and out-of-stock products", () => {
    const skus = searchTiles(tiles, { surface: "floor", wetArea: true }).map((r) => r.product.sku);
    expect(skus).not.toContain("dry-only");
    expect(skus).not.toContain("gone");
    expect(skus).not.toContain("wall");
  });

  it("requires a known price under maxPrice", () => {
    const skus = searchTiles([makeTile({ sku: "p", price: null }), makeTile({ sku: "q", price: 50000 })], { maxPrice: 60000 }).map((r) => r.product.sku);
    expect(skus).toEqual(["q"]);
  });

  it("matches color, finish and design accent-insensitively", () => {
    const result = searchTiles(tiles, { color: "BLANCO", finish: "brillante", design: "marmol" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("respects the limit", () => {
    expect(searchTiles(tiles, {}, 2)).toHaveLength(2);
  });
});

describe("searchAdhesives", () => {
  const adhesives = [
    makeAdhesive({ sku: "ceramic-only" }),
    makeAdhesive({ sku: "all", compatibleMaterials: ["ceramic", "porcelain", "stoneware", "porcelatech"], excludedMaterials: [], price: 30000 }),
    makeAdhesive({ sku: "indoor", compatibleMaterials: ["porcelain"], excludedMaterials: [], outdoor: false }),
    makeAdhesive({ sku: "unknown", compatibleMaterials: null, excludedMaterials: [], outdoor: null }),
  ];

  it("excludes adhesives whose sheet excludes the material", () => {
    const skus = searchAdhesives(adhesives, { tileMaterial: "porcelain" }).map((r) => r.product.sku);
    expect(skus).not.toContain("ceramic-only");
    expect(skus[0]).toBe("all");
  });

  it("excludes interior-only adhesives for outdoor projects", () => {
    const skus = searchAdhesives(adhesives, { tileMaterial: "porcelain", outdoor: true }).map((r) => r.product.sku);
    expect(skus).toEqual(["all", "unknown"]);
  });
});

describe("searchGrouts", () => {
  const grouts = [
    makeGrout({ sku: "narrow" }),
    makeGrout({ sku: "universal", name: "Concolor Junta Universal Gris", jointMm: { min: 1, max: 12 } }),
    makeGrout({ sku: "repair", groutType: "repair" }),
    makeGrout({ sku: "no-range", jointMm: null }),
  ];

  it("filters by joint range and never returns repair products", () => {
    const skus = searchGrouts(grouts, { jointWidthMm: 8 }).map((r) => r.product.sku);
    expect(skus).toEqual(["universal", "no-range"]);
  });

  it("filters by color in the name", () => {
    expect(searchGrouts(grouts, { color: "gris" }).map((r) => r.product.sku)).toEqual(["universal"]);
  });
});
