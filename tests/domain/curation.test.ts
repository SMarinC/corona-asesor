import { describe, expect, it } from "vitest";
import { findAdhesiveLine } from "@/lib/domain/adhesive-lines";
import { attachAdhesiveLines, attachGroutJoints, curate, dedupeChunks } from "@/lib/domain/curation";
import type { RawChunk, RawProduct, SheetChunk } from "@/lib/domain/types";
import { makeAdhesive, makeGrout } from "@/tests/fixtures/products";

const chunk = (sku: string, text: string, template = "materiales_pinturas", section = "USOS"): RawChunk => ({
  sku,
  pdfId: `${sku}-pdf`,
  section,
  template,
  text,
});

describe("findAdhesiveLine", () => {
  it.each([
    ["PEGACOR® Cerámico Blanco", "ceramico"],
    ["PEGACOR® Porcelanico Gris", "porcelanico"],
    ["PEGACOR® Ultra Gel Gris 25 kg", "ultra"],
    ["PEGACOR® Interiores Gris", "interiores"],
  ])("maps %s to the %s line", (name, key) => {
    expect(findAdhesiveLine(name)?.key).toBe(key);
  });
  it("returns null for lines without curated evidence", () => {
    expect(findAdhesiveLine("PEGACOR® Rápido Blanco")).toBeNull();
  });
});

describe("dedupeChunks", () => {
  it("merges identical texts, keeps only catalog SKUs and numbers citations", () => {
    const result = dedupeChunks(
      [chunk("v1", "Texto  A"), chunk("v2", "Texto A"), chunk("family", "Texto A"), chunk("family", "Solo familia"), chunk("v1", "Texto B")],
      new Set(["v1", "v2"]),
    );
    expect(result).toEqual([
      { citationId: "c0001", skus: ["v1", "v2"], section: "USOS", docType: "materiales_pinturas", text: "Texto  A" },
      { citationId: "c0002", skus: ["v1"], section: "USOS", docType: "materiales_pinturas", text: "Texto B" },
    ]);
  });
});

describe("attachGroutJoints", () => {
  it("takes the joint range from the grout's own sheet with its citation", () => {
    const sheets: SheetChunk[] = [
      { citationId: "c0001", skus: ["G1"], section: "DESCRIPCIÓN", docType: "materiales_pinturas", text: "Permite emboquillar juntas de 1 -5mm con una" },
    ];
    const [grout] = attachGroutJoints([makeGrout({ jointMm: null, jointCitationId: null })], sheets);
    expect(grout).toMatchObject({ jointMm: { min: 1, max: 5 }, jointCitationId: "c0001" });
  });
});

describe("attachAdhesiveLines", () => {
  const usos =
    "Usos Para la instalación de revestimientos Cerámicos de media o alta absorción (no gres porcelánico), en pisos y paredes en zonas Interiores y Exteriores , sobre superficies";

  it("fills compatibility from a verified quote", () => {
    const sheets: SheetChunk[] = [{ citationId: "c0007", skus: ["A1"], section: "USOS", docType: "materiales_pinturas", text: usos }];
    const blank = makeAdhesive({ compatibleMaterials: null, excludedMaterials: [], outdoor: null, compatibilityCitationId: null });
    expect(attachAdhesiveLines([blank], sheets)[0]).toMatchObject({
      compatibleMaterials: ["ceramic"],
      excludedMaterials: ["porcelain"],
      outdoor: true,
      compatibilityCitationId: "c0007",
    });
  });

  it("fails loudly when the quote is not in the product's sheet", () => {
    const blank = makeAdhesive({ compatibleMaterials: null, compatibilityCitationId: null });
    expect(() => attachAdhesiveLines([blank], [])).toThrow(/Evidence for adhesive line "ceramico" not found/);
  });
});

describe("curate", () => {
  const products: RawProduct[] = [
    {
      sku: "G1", url: null, name: "CONCOLOR® Junta Estrecha 2 Kg Blanco", description: null, category: "Boquillas",
      subcategory: "CONCOLOR® Junta Estrecha 2 Kg", price: 15700, is_in_stock: true, is_variant: true,
      images: "[]", specifications: "{}", specs_pdf: '{"presentacion_kg": 2}', ficha_tecnica_url: null,
    },
    {
      sku: "family", url: null, name: "Concolor Junta Estrecha", description: null, category: "Boquillas",
      subcategory: "Concolor Junta Estrecha", price: null, is_in_stock: null, is_variant: false,
      images: "[]", specifications: "{}", specs_pdf: "{}", ficha_tecnica_url: null,
    },
  ];
  const chunks = [
    chunk("G1", "juntas desde 1mm de espesor hasta 5 mm. Para un"),
    chunk("family", "juntas desde 1mm de espesor hasta 5 mm. Para un"),
    chunk("G1", "SECCIÓN 11: INFORMACIÓN TOXICOLÓGICA", "hoja_seguridad_ghs"),
  ];

  it("drops family pages and safety sheets and reports the counts", () => {
    const result = curate(products, chunks);
    expect(result.products.map((p) => p.sku)).toEqual(["G1"]);
    expect(result.chunks).toHaveLength(1);
    expect(result.report).toMatchObject({
      rawProducts: 2,
      catalogProducts: 1,
      grouts: 1,
      rawChunks: 3,
      safetyChunksDropped: 1,
      uniqueChunks: 1,
      groutsWithJointRange: 1,
    });
  });
});
