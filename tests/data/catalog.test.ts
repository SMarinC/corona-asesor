import { describe, expect, it } from "vitest";
import { createCatalog, getCatalog } from "@/lib/data/catalog";
import { makeTile } from "@/tests/fixtures/products";

describe("createCatalog", () => {
  it("splits products by kind and indexes them by SKU", () => {
    const catalog = createCatalog([makeTile({ sku: "T9" })]);
    expect(catalog.tiles).toHaveLength(1);
    expect(catalog.get("T9")?.kind).toBe("tile");
    expect(catalog.get("missing")).toBeUndefined();
  });
});

describe("getCatalog (data/catalog.json)", () => {
  const catalog = getCatalog();

  it("contains only the 341 purchasable products", () => {
    expect(catalog.all).toHaveLength(341);
    expect(catalog.tiles).toHaveLength(298);
    expect(catalog.adhesives).toHaveLength(12);
    expect(catalog.grouts).toHaveLength(31);
  });

  it("has box coverage for almost every tile", () => {
    const withBox = catalog.tiles.filter((t) => t.m2PerBox !== null).length;
    expect(withBox).toBeGreaterThanOrEqual(290);
  });

  it("backs every adhesive compatibility with a citation", () => {
    for (const adhesive of catalog.adhesives) {
      if (adhesive.compatibleMaterials !== null) expect(adhesive.compatibilityCitationId).not.toBeNull();
    }
  });
});
