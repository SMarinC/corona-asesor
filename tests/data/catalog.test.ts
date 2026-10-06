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

  it("keeps a tile without m² per box out of what the agent can offer, and says why", () => {
    const catalog = createCatalog([makeTile({ sku: "T9" }), makeTile({ sku: "T8", name: "Piso Sin Caja", m2PerBox: null })]);
    expect(catalog.all.map((p) => p.sku)).toEqual(["T9"]);
    expect(catalog.tiles.map((p) => p.sku)).toEqual(["T9"]);
    expect(catalog.get("T8")).toBeUndefined();
    expect(catalog.notQuotable("T8")).toBe("El producto Piso Sin Caja (SKU T8) no tiene en el catálogo los m² por caja; no se puede cotizar con este asesor.");
    expect(catalog.notQuotable("T9")).toBeUndefined();
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

  it("offers the 336 purchasable products whose data has every value a quote needs", () => {
    expect(catalog.all).toHaveLength(336);
    expect(catalog.tiles).toHaveLength(296);
    expect(catalog.adhesives).toHaveLength(11);
    expect(catalog.grouts).toHaveLength(29);
  });

  it("keeps out the supplies whose data cannot size a quantity", () => {
    // Capa Gruesa states coverage per cm of thickness, not per m²; the Spectralock mini units state neither weight nor joint range.
    expect(catalog.notQuotable("901091501")).toContain("el rendimiento en kg/m²");
    for (const sku of ["95400100S", "95400151S"]) expect(catalog.notQuotable(sku), sku).toContain("el peso por unidad");
    // The 10 kg bag keeps its own size, not the 25 kg of the family sheet it shares.
    expect(catalog.get("901061501")).toMatchObject({ bagKg: 10 });
  });

  it("takes m² per box from the tile's own sheet when the structured specs lack it", () => {
    // Both Ticino sheets say "M2 POR CAJA ... 2" (32 pieces of 25x25 cm); the other two sheets state no value.
    expect(catalog.get("257049001")).toMatchObject({ m2PerBox: 2 });
    expect(catalog.get("257059181")).toMatchObject({ m2PerBox: 2 });
    for (const sku of ["19108871", "8027909"]) expect(catalog.notQuotable(sku), sku).toContain("no tiene en el catálogo los m² por caja");
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

  it("keeps a compatibility citation on every offered adhesive", () => {
    expect(catalog.adhesives.filter((a) => a.compatibilityCitationId !== null).length).toBe(11);
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
