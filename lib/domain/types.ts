/** `null` means the source data does not say — never assume false. */
export type TriState = boolean | null;
export type Surface = "floor" | "wall";
export type Traffic = "low" | "medium" | "high";
/** PorcelaTech is kept apart from porcelain: some adhesives accept it while excluding gres porcelánico. */
export type TileMaterial = "ceramic" | "porcelain" | "porcelatech" | "stoneware";
export type Environment = "indoor" | "outdoor";

export interface Range {
  min: number;
  max: number;
}

export interface FormatMm {
  length: number;
  width: number;
}

export interface ProductBase {
  sku: string;
  name: string;
  description: string | null;
  url: string | null;
  imageUrls: string[];
  /** COP. Tiles: per box. Adhesives: per bag. Grouts: per unit. */
  price: number | null;
  inStock: boolean;
  datasheetUrl: string | null;
}

export interface Tile extends ProductBase {
  kind: "tile";
  surface: Surface;
  formatMm: FormatMm | null;
  thicknessMm: number | null;
  m2PerBox: number | null;
  piecesPerBox: number | null;
  finish: string | null;
  design: string | null;
  materials: TileMaterial[];
  usageAreas: string[];
  indoor: TriState;
  outdoor: TriState;
  wetArea: TriState;
  traffic: Traffic | null;
  /** Traffic label exactly as printed in the technical sheet. */
  trafficLabel: string | null;
}

export interface Adhesive extends ProductBase {
  kind: "adhesive";
  /** `null` when no verified sheet quote supports a material list. */
  compatibleMaterials: TileMaterial[] | null;
  /** Materials the sheet explicitly excludes (e.g. "no gres porcelánico"). */
  excludedMaterials: TileMaterial[];
  outdoor: TriState;
  /** Sheet chunk whose text backs `compatibleMaterials` / `outdoor`. */
  compatibilityCitationId: string | null;
  coverageKgM2: Range | null;
  coverageText: string | null;
  bagKg: number | null;
  standard: string | null;
}

export type GroutType = "cementitious" | "epoxy" | "repair";

export interface Grout extends ProductBase {
  kind: "grout";
  groutType: GroutType;
  jointMm: Range | null;
  /** Sheet chunk whose text states `jointMm`. */
  jointCitationId: string | null;
  packageKg: number | null;
  coverageText: string | null;
}

export type Product = Tile | Adhesive | Grout;

export interface SheetChunk {
  citationId: string;
  /** Catalog SKUs whose technical sheet contains this chunk. */
  skus: string[];
  section: string;
  docType: string;
  text: string;
}

/** Row of the prototype `products` table. JSON columns arrive as strings. */
export interface RawProduct {
  sku: string;
  url: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  is_in_stock: boolean | null;
  is_variant: boolean | null;
  images: unknown;
  specifications: unknown;
  specs_pdf: unknown;
  ficha_tecnica_url: string | null;
}

/** Technical-sheet fragment as stored in the prototype Chroma database. */
export interface RawChunk {
  sku: string;
  pdfId: string;
  section: string;
  template: string;
  text: string;
}
