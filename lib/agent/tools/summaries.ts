import { round } from "@/lib/domain/calculations";
import { displayName } from "@/lib/domain/display-name";
import type { Adhesive, Grout, Product, Tile } from "@/lib/domain/types";

/** What one unit of `price` buys, per product kind. */
export const PRICE_UNIT = { tile: "caja", adhesive: "bulto", grout: "unidad" } as const satisfies Record<Product["kind"], string>;

export interface TileSummary {
  sku: string;
  name: string;
  price: number | null;
  priceUnit: "caja";
  /** Box price ÷ m² per box, rounded to whole pesos; null when either is unknown. */
  pricePerM2: number | null;
  m2PerBox: number | null;
  formatMm: Tile["formatMm"];
  surface: Tile["surface"];
  finish: string | null;
  design: string | null;
  materials: Tile["materials"];
  indoor: Tile["indoor"];
  outdoor: Tile["outdoor"];
  wetArea: Tile["wetArea"];
  traffic: Tile["traffic"];
  trafficLabel: string | null;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
}

export function summarizeTile(t: Tile): TileSummary {
  return {
    sku: t.sku,
    name: displayName(t),
    price: t.price,
    priceUnit: PRICE_UNIT.tile,
    pricePerM2: t.price !== null && t.m2PerBox !== null ? round(t.price / t.m2PerBox, 0) : null,
    m2PerBox: t.m2PerBox,
    formatMm: t.formatMm,
    surface: t.surface,
    finish: t.finish,
    design: t.design,
    materials: t.materials,
    indoor: t.indoor,
    outdoor: t.outdoor,
    wetArea: t.wetArea,
    traffic: t.traffic,
    trafficLabel: t.trafficLabel,
    inStock: t.inStock,
    url: t.url,
    imageUrl: t.imageUrls[0] ?? null,
  };
}

export interface AdhesiveSummary {
  sku: string;
  name: string;
  price: number | null;
  priceUnit: "bulto";
  bagKg: number | null;
  coverageKgM2: Adhesive["coverageKgM2"];
  compatibleMaterials: Adhesive["compatibleMaterials"];
  excludedMaterials: Adhesive["excludedMaterials"];
  outdoor: Adhesive["outdoor"];
  compatibilityCitationId: string | null;
  standard: string | null;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
}

export function summarizeAdhesive(a: Adhesive): AdhesiveSummary {
  return {
    sku: a.sku,
    name: displayName(a),
    price: a.price,
    priceUnit: PRICE_UNIT.adhesive,
    bagKg: a.bagKg,
    coverageKgM2: a.coverageKgM2,
    compatibleMaterials: a.compatibleMaterials,
    excludedMaterials: a.excludedMaterials,
    outdoor: a.outdoor,
    compatibilityCitationId: a.compatibilityCitationId,
    standard: a.standard,
    inStock: a.inStock,
    url: a.url,
    imageUrl: a.imageUrls[0] ?? null,
  };
}

export interface GroutSummary {
  sku: string;
  name: string;
  price: number | null;
  priceUnit: "unidad";
  packageKg: number | null;
  groutType: Grout["groutType"];
  jointMm: Grout["jointMm"];
  jointCitationId: string | null;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
}

export function summarizeGrout(g: Grout): GroutSummary {
  return {
    sku: g.sku,
    name: displayName(g),
    price: g.price,
    priceUnit: PRICE_UNIT.grout,
    packageKg: g.packageKg,
    groutType: g.groutType,
    jointMm: g.jointMm,
    jointCitationId: g.jointCitationId,
    inStock: g.inStock,
    url: g.url,
    imageUrl: g.imageUrls[0] ?? null,
  };
}
