import { describe, expect, it } from "vitest";
import { skuKey } from "@/lib/domain/sku";
import { createCatalog, getCatalog } from "@/lib/data/catalog";
import { normalizeText, parseKg } from "@/lib/domain/parse";
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

  it("marks a tile outdoor only when it lists an outdoor usage area", () => {
    const outdoorAreas = ["areas exteriores", "areas exteriores techadas", "terrazas"];
    const wrong = catalog.tiles.filter(
      (t) => t.outdoor === true && !t.usageAreas.some((a) => outdoorAreas.includes(normalizeText(a))),
    );
    expect(wrong.map((t) => t.sku)).toEqual([]);
  });

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

  it("uses the kg amount in the SKU's own name as package size", () => {
    for (const a of catalog.adhesives) {
      const kg = parseKg(a.name);
      if (kg !== null) expect(a.bagKg, a.sku).toBe(kg);
    }
    for (const g of catalog.grouts) {
      const kg = parseKg(g.name);
      if (kg !== null) expect(g.packageKg, g.sku).toBe(kg);
    }
  });

  it("keeps the 12 adhesives with a compatibility citation", () => {
    expect(catalog.adhesives.filter((a) => a.compatibilityCitationId !== null).length).toBe(12);
  });

  it("never labels a porcelain-named tile as stoneware", () => {
    const wrong = catalog.tiles.filter((t) => t.materials.includes("stoneware") && normalizeText(t.name).includes("porcelan"));
    expect(wrong.map((t) => t.sku)).toEqual([]);
  });
});

describe("catalog.get with a trailing period", () => {
  it("finds a SKU stored with a trailing period without it, and the other way round", () => {
    const catalog = createCatalog([makeTile({ sku: "123." }), makeTile({ sku: "456" })]);
    expect(catalog.get("123")?.sku).toBe("123.");
    expect(catalog.get("123.")?.sku).toBe("123.");
    expect(catalog.get("456.")?.sku).toBe("456");
    expect(catalog.get("12")).toBeUndefined();
  });

  it("resolves a real trailing-dot SKU from data/catalog.json", () => {
    expect(getCatalog().get("401072001")?.sku).toBe("401072001.");
  });
});

describe("skuKey on the real catalog", () => {
  it("produces no collisions between products", () => {
    const { all } = getCatalog();
    expect(new Set(all.map((p) => skuKey(p.sku))).size).toBe(all.length);
  });
});
