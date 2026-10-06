import { findAdhesiveLine } from "./adhesive-lines";
import { normalizeProduct } from "./normalize";
import { normalizeText, parseJointRangeMm, statedM2PerBox } from "./parse";
import type { Product, RawChunk, RawProduct, SheetChunk } from "./types";

export interface CurationReport {
  rawProducts: number;
  catalogProducts: number;
  tiles: number;
  adhesives: number;
  grouts: number;
  rawChunks: number;
  safetyChunksDropped: number;
  uniqueChunks: number;
  groutsWithJointRange: number;
  adhesivesWithVerifiedLine: number;
  tilesWithM2PerBox: number;
}

const isSafetySheet = (chunk: RawChunk) => chunk.template.startsWith("hoja_seguridad");

/** Every variant carried its own copy of the family sheet: keep one chunk per text. */
export function dedupeChunks(raw: RawChunk[], catalogSkus: Set<string>): SheetChunk[] {
  const byText = new Map<string, { first: RawChunk; skus: Set<string> }>();
  for (const chunk of raw) {
    const key = chunk.text.replace(/\s+/g, " ").trim();
    if (key === "") continue;
    const entry = byText.get(key);
    if (entry) entry.skus.add(chunk.sku);
    else byText.set(key, { first: chunk, skus: new Set([chunk.sku]) });
  }
  const out: SheetChunk[] = [];
  for (const { first, skus } of byText.values()) {
    const linked = [...skus].filter((sku) => catalogSkus.has(sku)).sort();
    if (linked.length === 0) continue;
    out.push({
      citationId: `c${String(out.length + 1).padStart(4, "0")}`,
      skus: linked,
      section: first.section,
      docType: first.template,
      text: first.text.trim(),
    });
  }
  return out;
}

export function attachGroutJoints(products: Product[], chunks: SheetChunk[]): Product[] {
  return products.map((product) => {
    if (product.kind !== "grout") return product;
    for (const chunk of chunks) {
      if (!chunk.skus.includes(product.sku)) continue;
      const range = parseJointRangeMm(chunk.text);
      if (range) return { ...product, jointMm: range, jointCitationId: chunk.citationId };
    }
    return product;
  });
}

/**
 * A tile whose structured specs lack m² per box takes it from its own sheet, when a chunk that belongs to that SKU
 * alone states exactly one value. Chunks shared across variants are skipped: a family sheet can describe another size.
 */
export function fillM2PerBoxFromSheets(products: Product[], chunks: SheetChunk[]): Product[] {
  return products.map((product) => {
    if (product.kind !== "tile" || product.m2PerBox !== null) return product;
    for (const chunk of chunks) {
      if (chunk.skus.length !== 1 || chunk.skus[0] !== product.sku) continue;
      const m2PerBox = statedM2PerBox(chunk.text);
      if (m2PerBox !== null) return { ...product, m2PerBox };
    }
    return product;
  });
}

export function attachAdhesiveLines(products: Product[], chunks: SheetChunk[]): Product[] {
  return products.map((product) => {
    if (product.kind !== "adhesive") return product;
    const line = findAdhesiveLine(product.name);
    if (!line) return product;
    const evidence = normalizeText(line.evidence);
    const source = chunks.find((c) => c.skus.includes(product.sku) && normalizeText(c.text).includes(evidence));
    if (!source) {
      throw new Error(
        `Evidence for adhesive line "${line.key}" not found in the sheets of ${product.sku} (${product.name}). ` +
          "Fix the quote in lib/domain/adhesive-lines.ts so it matches the sheet text verbatim.",
      );
    }
    return {
      ...product,
      compatibleMaterials: line.compatibleMaterials,
      excludedMaterials: line.excludedMaterials,
      outdoor: line.outdoor,
      compatibilityCitationId: source.citationId,
    };
  });
}

export function curate(
  rawProducts: RawProduct[],
  rawChunks: RawChunk[],
): { products: Product[]; chunks: SheetChunk[]; report: CurationReport } {
  const normalized = rawProducts.map(normalizeProduct).filter((p): p is Product => p !== null);
  const catalogSkus = new Set(normalized.map((p) => p.sku));
  const relevant = rawChunks.filter((c) => !isSafetySheet(c));
  const chunks = dedupeChunks(relevant, catalogSkus);
  const products = fillM2PerBoxFromSheets(attachAdhesiveLines(attachGroutJoints(normalized, chunks), chunks), chunks);

  const count = (predicate: (p: Product) => boolean) => products.filter(predicate).length;
  return {
    products,
    chunks,
    report: {
      rawProducts: rawProducts.length,
      catalogProducts: products.length,
      tiles: count((p) => p.kind === "tile"),
      adhesives: count((p) => p.kind === "adhesive"),
      grouts: count((p) => p.kind === "grout"),
      rawChunks: rawChunks.length,
      safetyChunksDropped: rawChunks.length - relevant.length,
      uniqueChunks: chunks.length,
      groutsWithJointRange: count((p) => p.kind === "grout" && p.jointMm !== null),
      adhesivesWithVerifiedLine: count((p) => p.kind === "adhesive" && p.compatibilityCitationId !== null),
      tilesWithM2PerBox: count((p) => p.kind === "tile" && p.m2PerBox !== null),
    },
  };
}
