import {
  normalizeText,
  parseCoverageKgM2,
  parseFormatMm,
  parseKg,
  parseThicknessMm,
} from "./parse";
import type {
  Adhesive,
  Grout,
  GroutType,
  Product,
  ProductBase,
  RawProduct,
  Tile,
  TileMaterial,
  Traffic,
  TriState,
} from "./types";

type Specs = Record<string, unknown>;

const OUTDOOR_AREAS = new Set([
  "areas exteriores",
  "areas exteriores techadas",
  "terrazas",
  "interior de piscinas",
  "piscina",
]);
const WET_AREAS = new Set([...OUTDOOR_AREAS, "bano", "cocina"]);

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function list(specs: Specs, key: string): string[] {
  const value = specs[key];
  if (Array.isArray(value)) return value.map(String).filter((v) => v.trim() !== "");
  return typeof value === "string" && value.trim() !== "" ? [value.trim()] : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.replace(/\s+/g, " ").trim() : null;
}

function positiveNumber(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function deriveEnvironment(areas: string[]): {
  indoor: TriState;
  outdoor: TriState;
  wetArea: TriState;
} {
  if (areas.length === 0) return { indoor: null, outdoor: null, wetArea: null };
  const normalized = areas.map(normalizeText);
  return {
    indoor: normalized.some((a) => !OUTDOOR_AREAS.has(a)),
    outdoor: normalized.some((a) => OUTDOOR_AREAS.has(a)),
    wetArea: normalized.some((a) => WET_AREAS.has(a)),
  };
}

/** Maps the sheet's traffic label to the project traffic scale. */
export function mapTraffic(label: string | null): Traffic | null {
  if (!label) return null;
  const l = normalizeText(label);
  if (l.includes("comercial")) return "high";
  if (l.includes("residencial general")) return "medium";
  if (l.includes("moderado")) return "low";
  return null;
}

export function mapMaterials(values: string[], productName = ""): TileMaterial[] {
  const namedPorcelain = normalizeText(productName).includes("porcelan");
  const out = new Set<TileMaterial>();
  for (const value of values.map(normalizeText)) {
    if (value.includes("porcelatech")) out.add("porcelatech");
    else if (value.includes("porcel")) out.add("porcelain");
    else if (value.includes("gres")) out.add(namedPorcelain ? "porcelain" : "stoneware");
    else if (value.includes("ceramic")) out.add("ceramic");
  }
  return [...out];
}

function groutType(name: string): GroutType {
  const n = normalizeText(name);
  if (n.includes("reparador")) return "repair";
  if (n.includes("spectralock") || n.includes("epox")) return "epoxy";
  return "cementitious";
}

function normalizeTile(base: ProductBase, subcategory: string | null, specs: Specs, pdf: Specs): Tile {
  const usageAreas = list(specs, "Áreas de uso");
  const trafficLabel = text(pdf.trafico);
  return {
    ...base,
    kind: "tile",
    surface: normalizeText(subcategory ?? "").includes("pared") ? "wall" : "floor",
    formatMm: parseFormatMm(text(pdf.formato), base.name),
    thicknessMm: parseThicknessMm(text(pdf.espesor_nominal) ?? list(specs, "Espesor")[0] ?? null),
    m2PerBox: positiveNumber(pdf.m2_por_caja),
    piecesPerBox: positiveNumber(pdf.unidades_por_caja),
    finish: list(specs, "Acabado")[0] ?? text(pdf.acabado),
    design: list(specs, "Diseño")[0] ?? null,
    materials: mapMaterials(list(specs, "Materiales"), base.name),
    usageAreas,
    ...deriveEnvironment(usageAreas),
    traffic: mapTraffic(trafficLabel),
    trafficLabel,
  };
}

function normalizeAdhesive(base: ProductBase, specs: Specs, pdf: Specs): Adhesive {
  const coverageText = text(pdf.rendimiento_texto) ?? list(specs, "Rendimiento")[0] ?? null;
  return {
    ...base,
    kind: "adhesive",
    compatibleMaterials: null,
    excludedMaterials: [],
    outdoor: null,
    compatibilityCitationId: null,
    coverageKgM2: parseCoverageKgM2(coverageText),
    coverageText,
    bagKg: parseKg(base.name) ?? positiveNumber(pdf.presentacion_kg),
    standard: text(pdf.clasificacion_normativa),
  };
}

function normalizeGrout(base: ProductBase, subcategory: string | null, specs: Specs, pdf: Specs): Grout {
  return {
    ...base,
    kind: "grout",
    groutType: groutType(base.name),
    jointMm: null,
    jointCitationId: null,
    packageKg: parseKg(base.name) ?? positiveNumber(pdf.presentacion_kg) ?? parseKg(subcategory),
    coverageText: text(pdf.rendimiento_texto) ?? list(specs, "Rendimiento")[0] ?? null,
  };
}

export const MAX_IMAGES_PER_PRODUCT = 3;

/** Returns `null` for product-family pages and categories outside the agent's scope. */
export function normalizeProduct(raw: RawProduct): Product | null {
  if (raw.is_variant !== true) return null;
  const specs = parseJsonField<Specs>(raw.specifications, {});
  const pdf = parseJsonField<Specs>(raw.specs_pdf, {});
  const images = parseJsonField<unknown[]>(raw.images, []);
  const base: ProductBase = {
    sku: raw.sku,
    name: text(raw.name) ?? raw.sku,
    description: text(raw.description),
    url: text(raw.url),
    imageUrls: images.filter((i): i is string => typeof i === "string" && i !== "").slice(0, MAX_IMAGES_PER_PRODUCT),
    price: positiveNumber(raw.price),
    inStock: raw.is_in_stock === true,
    datasheetUrl: text(raw.ficha_tecnica_url),
  };
  switch (raw.category) {
    case "Revestimientos":
      return normalizeTile(base, raw.subcategory, specs, pdf);
    case "Pegantes":
      return normalizeAdhesive(base, specs, pdf);
    case "Boquillas":
      return normalizeGrout(base, raw.subcategory, specs, pdf);
    default:
      return null;
  }
}
