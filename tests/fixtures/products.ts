import type { Adhesive, Grout, Tile } from "@/lib/domain/types";

export function makeTile(overrides: Partial<Tile> = {}): Tile {
  return {
    kind: "tile",
    sku: "T1",
    name: "Piso Prueba Blanco 60x60",
    description: null,
    url: "https://corona.co/p/T1",
    imageUrls: [],
    price: 80000,
    inStock: true,
    datasheetUrl: null,
    surface: "floor",
    formatMm: { length: 600, width: 600 },
    thicknessMm: 8.5,
    m2PerBox: 1.44,
    piecesPerBox: 4,
    finish: "Brillante",
    design: "Marmolizado",
    materials: ["ceramic"],
    usageAreas: ["Baño", "Cocina", "Alcobas"],
    indoor: true,
    outdoor: false,
    wetArea: true,
    traffic: "medium",
    trafficLabel: "Residencial General",
    ...overrides,
  };
}

export function makeAdhesive(overrides: Partial<Adhesive> = {}): Adhesive {
  return {
    kind: "adhesive",
    sku: "A1",
    name: "PEGACOR® Cerámico Gris",
    description: null,
    url: null,
    imageUrls: [],
    price: 37400,
    inStock: true,
    datasheetUrl: null,
    compatibleMaterials: ["ceramic"],
    excludedMaterials: ["porcelain"],
    outdoor: true,
    compatibilityCitationId: "c0001",
    coverageKgM2: { min: 4, max: 5 },
    coverageText: "4.0-5.0 kg/m2",
    bagKg: 25,
    standard: "C1",
    ...overrides,
  };
}

export function makeGrout(overrides: Partial<Grout> = {}): Grout {
  return {
    kind: "grout",
    sku: "G1",
    name: "CONCOLOR® Junta Estrecha 2 Kg Blanco",
    description: null,
    url: null,
    imageUrls: [],
    price: 15700,
    inStock: true,
    datasheetUrl: null,
    groutType: "cementitious",
    jointMm: { min: 1, max: 5 },
    jointCitationId: "c0002",
    packageKg: 2,
    coverageText: null,
    ...overrides,
  };
}
