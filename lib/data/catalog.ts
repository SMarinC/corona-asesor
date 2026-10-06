import { readFileSync } from "node:fs";
import path from "node:path";
import { isQuotable, notQuotableMessage, type QuotableProduct, type QuotableTile } from "@/lib/domain/quotable";
import { skuKey } from "@/lib/domain/sku";
import type { Adhesive, Grout, Product } from "@/lib/domain/types";

export const DATA_DIR = path.join(process.cwd(), "data");

/** What the agent can offer: only products whose company data has every value a quote needs. */
export interface Catalog {
  all: QuotableProduct[];
  tiles: QuotableTile[];
  adhesives: Adhesive[];
  grouts: Grout[];
  get(sku: string): QuotableProduct | undefined;
  /** Why a product that is in the data is not offered (Spanish, for the model); undefined when it is offered or unknown. */
  notQuotable(sku: string): string | undefined;
}

export function createCatalog(products: Product[]): Catalog {
  const offered = products.filter(isQuotable);
  const excluded = new Map<string, string>();
  for (const product of products) {
    const message = notQuotableMessage(product);
    if (message !== null) excluded.set(skuKey(product.sku), message);
  }
  const bySku = new Map(offered.map((p) => [skuKey(p.sku), p]));
  return {
    all: offered,
    tiles: offered.filter((p): p is QuotableTile => p.kind === "tile"),
    adhesives: offered.filter((p): p is Adhesive => p.kind === "adhesive"),
    grouts: offered.filter((p): p is Grout => p.kind === "grout"),
    get: (sku) => bySku.get(skuKey(sku)),
    notQuotable: (sku) => excluded.get(skuKey(sku)),
  };
}

let cached: Catalog | null = null;

export function getCatalog(): Catalog {
  cached ??= createCatalog(JSON.parse(readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8")) as Product[]);
  return cached;
}
