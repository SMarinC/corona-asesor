import { readFileSync } from "node:fs";
import path from "node:path";
import { skuKey } from "@/lib/domain/sku";
import type { Adhesive, Grout, Product, Tile } from "@/lib/domain/types";

export const DATA_DIR = path.join(process.cwd(), "data");

export interface Catalog {
  all: Product[];
  tiles: Tile[];
  adhesives: Adhesive[];
  grouts: Grout[];
  get(sku: string): Product | undefined;
}

export function createCatalog(products: Product[]): Catalog {
  const bySku = new Map(products.map((p) => [skuKey(p.sku), p]));
  return {
    all: products,
    tiles: products.filter((p): p is Tile => p.kind === "tile"),
    adhesives: products.filter((p): p is Adhesive => p.kind === "adhesive"),
    grouts: products.filter((p): p is Grout => p.kind === "grout"),
    get: (sku) => bySku.get(skuKey(sku)),
  };
}

let cached: Catalog | null = null;

export function getCatalog(): Catalog {
  cached ??= createCatalog(JSON.parse(readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8")) as Product[]);
  return cached;
}
