import { describe, expect, it } from "vitest";
import {
  deriveEnvironment,
  mapMaterials,
  mapTraffic,
  normalizeProduct,
} from "@/lib/domain/normalize";
import type { RawProduct } from "@/lib/domain/types";

function raw(overrides: Partial<RawProduct>): RawProduct {
  return {
    sku: "X",
    url: null,
    name: "Producto",
    description: null,
    category: "Revestimientos",
    subcategory: "Pisos",
    price: null,
    is_in_stock: true,
    is_variant: true,
    images: "[]",
    specifications: "{}",
    specs_pdf: "{}",
    ficha_tecnica_url: null,
    ...overrides,
  };
}

describe("deriveEnvironment", () => {
  it("returns unknown (null) when the product lists no usage areas", () => {
    expect(deriveEnvironment([])).toEqual({ indoor: null, outdoor: null, wetArea: null });
  });
  it("derives indoor + wet for a bathroom/kitchen tile", () => {
    expect(deriveEnvironment(["Alcobas", "Baño", "Cocina"])).toEqual({
      indoor: true,
      outdoor: false,
      wetArea: true,
    });
  });
  it("derives outdoor + wet for terraces", () => {
    expect(deriveEnvironment(["Terrazas"])).toEqual({ indoor: false, outdoor: true, wetArea: true });
  });
});

describe("mapTraffic", () => {
  it.each([
    ["Comercial Moderado", "high"],
    ["COMERCIAL ALTO", "high"],
    ["Residencial General", "medium"],
    ["Residencial Moderado", "low"],
    ["Uso moderado", "low"],
    ["Paredes", null],
    [null, null],
  ] as const)("maps %s to %s", (label, expected) => {
    expect(mapTraffic(label)).toBe(expected);
  });
});

describe("mapMaterials", () => {
  it("normalizes catalog material labels", () => {
    expect(mapMaterials(["Cerámica", "Ceramica"])).toEqual(["ceramic"]);
    expect(mapMaterials(["Gres Porcelánico"])).toEqual(["porcelain"]);
    expect(mapMaterials(["Porcelatech"])).toEqual(["porcelatech"]);
    expect(mapMaterials(["Gres"])).toEqual(["stoneware"]);
  });

  it("classifies Gres as porcelain only when the product name says porcelánico", () => {
    expect(mapMaterials(["Gres"], "Gres Porcelánico Cemento 60x60")).toEqual(["porcelain"]);
    expect(mapMaterials(["Gres"], "Piso Gres Rústico 30x30")).toEqual(["stoneware"]);
  });
});

describe("normalizeProduct", () => {
  it("skips product-family pages (is_variant = false)", () => {
    expect(normalizeProduct(raw({ is_variant: false }))).toBeNull();
  });

  it("caps product images at three, keeping order", () => {
    const product = normalizeProduct(raw({ images: JSON.stringify(["u1", "u2", "u3", "u4", "u5", "u6", "u7"]) }));
    expect(product?.imageUrls).toEqual(["u1", "u2", "u3"]);
  });

  it("normalizes a floor tile using the sheet-extracted specs_pdf column", () => {
    const tile = normalizeProduct(
      raw({
        sku: "604422001",
        name: "Piso Sibila Blanco Caras Diferenciadas 60x60",
        price: 79200,
        images: '["https://corona.co/medias/a.jpg"]',
        specifications: JSON.stringify({
          Materiales: ["Cerámica"],
          "Diseño": ["Marmolizado"],
          Acabado: ["Brillante"],
          "Áreas de uso": ["Alcobas", "Hall", "Baño", "Cocina"],
        }),
        specs_pdf: JSON.stringify({
          m2_por_caja: 1.8,
          unidades_por_caja: 5,
          espesor_nominal: "7,90 a 8,50 mm",
          trafico: "Residencial General",
          formato: "60X60 cm",
        }),
      }),
    );
    expect(tile).toMatchObject({
      kind: "tile",
      sku: "604422001",
      surface: "floor",
      price: 79200,
      inStock: true,
      imageUrls: ["https://corona.co/medias/a.jpg"],
      m2PerBox: 1.8,
      piecesPerBox: 5,
      thicknessMm: 8.5,
      formatMm: { length: 600, width: 600 },
      finish: "Brillante",
      design: "Marmolizado",
      materials: ["ceramic"],
      indoor: true,
      outdoor: false,
      wetArea: true,
      traffic: "medium",
      trafficLabel: "Residencial General",
    });
  });

  it("keeps missing tile data as null instead of guessing", () => {
    const tile = normalizeProduct(raw({ subcategory: "Paredes", name: "Pared Sin Datos" }));
    expect(tile).toMatchObject({
      kind: "tile",
      surface: "wall",
      m2PerBox: null,
      thicknessMm: null,
      formatMm: null,
      indoor: null,
      outdoor: null,
      wetArea: null,
      traffic: null,
    });
  });

  it("normalizes an adhesive with its coverage range and bag size", () => {
    const adhesive = normalizeProduct(
      raw({
        category: "Pegantes",
        subcategory: "PEGACOR® Max Gris",
        name: "PEGACOR® Max Gris",
        price: 94200,
        specs_pdf: JSON.stringify({
          presentacion_kg: 25,
          rendimiento_texto: "2.0-7.0 kg/m2 según formato",
          clasificacion_normativa: "C 2 H1I1",
        }),
      }),
    );
    expect(adhesive).toMatchObject({
      kind: "adhesive",
      coverageKgM2: { min: 2, max: 7 },
      coverageText: "2.0-7.0 kg/m2 según formato",
      bagKg: 25,
      standard: "C 2 H1I1",
      compatibleMaterials: null,
      excludedMaterials: [],
      outdoor: null,
      compatibilityCitationId: null,
    });
  });

  it.each([
    ["CONCOLOR® Junta Estrecha 2 Kg Blanco", "cementitious", 2],
    ["Mini Unit SPECTRALOCK® PRO Gris", "epoxy", null],
    ["Reparador Boquillas Blanco Antiguo", "repair", null],
  ] as const)("normalizes grout %s", (name, groutType, packageKg) => {
    const grout = normalizeProduct(raw({ category: "Boquillas", subcategory: name, name }));
    expect(grout).toMatchObject({ kind: "grout", groutType, packageKg, jointMm: null, jointCitationId: null });
  });

  it("prefers the SKU's own package size over the family sheet", () => {
    const grout = normalizeProduct(
      raw({
        category: "Boquillas",
        subcategory: "CONCOLOR® Junta Estrecha",
        name: "CONCOLOR® Junta Estrecha 5 Kg Blanco",
        specs_pdf: JSON.stringify({ presentacion_kg: 2 }),
      }),
    );
    expect(grout).toMatchObject({ kind: "grout", packageKg: 5 });
  });
});
