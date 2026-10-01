import type { ToolDeps } from "@/lib/agent/tools/deps";
import { createCatalog } from "@/lib/data/catalog";
import { getCompanyContext } from "@/lib/data/company";
import { createSheetSearch, type EmbedQuery } from "@/lib/data/sheets";
import { decodeIndex, encodeIndex } from "@/lib/data/vector";
import type { Product, SheetChunk } from "@/lib/domain/types";
import { makeAdhesive, makeGrout, makeTile } from "./products";

export const fixtureChunks: SheetChunk[] = [
  { citationId: "c0001", skus: ["A1"], section: "USOS", docType: "materiales_pinturas", text: "Pegante para cerámica en interiores y exteriores. No usar con gres porcelánico." },
  { citationId: "c0002", skus: ["G1"], section: "USOS", docType: "materiales_pinturas", text: "Boquilla para juntas de 1 a 5 mm." },
  { citationId: "c0003", skus: ["T2"], section: "ficha_general", docType: "revestimiento", text: "FORMATO 30x60 M2 POR CAJA 1,62 PIEZAS POR CAJA 9" },
  { citationId: "c0004", skus: ["A2"], section: "RENDIMIENTO", docType: "materiales_pinturas", text: "Rendimiento aproximado 5.0-6.0 kg/m2 según formato. Presentación bulto 25 kg." },
];

const dims = fixtureChunks.length;
export const oneHot = (i: number): number[] => Array.from({ length: dims }, (_, j) => (j === i ? 1 : 0));
const fixtureIndex = decodeIndex(encodeIndex(fixtureChunks.map((_, i) => oneHot(i)), dims), dims, dims);

export const fixtureProducts: Product[] = [
  // T1: floor, indoor, wet, ceramic, 1.44 m²/box, $80.000 per box.
  makeTile({ imageUrls: ["https://corona.co/medias/T1.jpg"] }),
  // T2: wall tile with no m²/box in the catalog (c0003 states 1,62).
  makeTile({
    sku: "T2", name: "Pared Prueba Gris 30x60", surface: "wall", formatMm: { length: 300, width: 600 },
    m2PerBox: null, piecesPerBox: 9, price: 45000, finish: "Mate", design: "Neutras", traffic: null, trafficLabel: "Paredes",
  }),
  // T3: outdoor porcelain floor tile.
  makeTile({
    sku: "T3", name: "Piso Exterior Terracota 45x45", formatMm: { length: 450, width: 450 }, m2PerBox: 1.62, price: 95000,
    finish: "Mate", design: "Exteriores", materials: ["porcelain"], usageAreas: ["Terrazas"],
    indoor: false, outdoor: true, wetArea: true, traffic: "high", trafficLabel: "Comercial Moderado",
  }),
  // T4: floor tile with unknown usage areas, no thickness and no price.
  makeTile({
    sku: "T4", name: "Piso Sin Ficha Beige 50x50", formatMm: { length: 500, width: 500 }, thicknessMm: null, price: null,
    design: null, usageAreas: [], indoor: null, outdoor: null, wetArea: null,
  }),
  // A1: ceramic-only adhesive that excludes porcelain, 4–5 kg/m², 25 kg bag.
  makeAdhesive(),
  // A2: adhesive with nothing verified in the catalog (c0004 states 5.0-6.0 kg/m2 and 25 kg).
  makeAdhesive({
    sku: "A2", name: "PEGACOR® Flex Gris", price: 148900, compatibleMaterials: null, excludedMaterials: [], outdoor: null,
    compatibilityCitationId: null, coverageKgM2: null, coverageText: null, bagKg: null, standard: null,
  }),
  // G1: cementitious grout for 1–5 mm joints, 2 kg units.
  makeGrout(),
  // G2: repair product, never offered for grouting.
  makeGrout({ sku: "G2", name: "Reparador de Juntas Blanco", groutType: "repair", jointMm: null, jointCitationId: null, price: 21000 }),
];

/** Fixture deps; the default embedder always points at c0001 (semantic mode, no network). */
export function makeToolDeps(options: { embedQuery?: EmbedQuery } = {}): ToolDeps {
  return {
    catalog: createCatalog(fixtureProducts),
    sheets: createSheetSearch({ chunks: fixtureChunks, index: fixtureIndex, embedQuery: options.embedQuery ?? (async () => oneHot(0)) }),
    company: getCompanyContext(),
  };
}
