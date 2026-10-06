import type { Adhesive, Grout, Product, Tile } from "./types";

/**
 * The agent works only with products whose company data has every value a quote needs: it never fills one in.
 * These types carry that guarantee, so the tools need no fallback for a missing value.
 */
export type QuotableTile = Tile & { m2PerBox: number };
export type QuotableProduct = QuotableTile | Adhesive | Grout;

/** The value a quote needs that the company data lacks for this product, in Spanish; null when it has them all. */
function missingQuoteValue(product: Product): string | null {
  if (product.kind === "tile" && product.m2PerBox === null) return "los m² por caja";
  return null;
}

export const isQuotable = (product: Product): product is QuotableProduct => missingQuoteValue(product) === null;

/** Why the agent cannot offer this product (Spanish, read by the model), or null when it can. */
export function notQuotableMessage(product: Product): string | null {
  const missing = missingQuoteValue(product);
  return missing === null ? null : `El producto ${product.name} (SKU ${product.sku}) no tiene en el catálogo ${missing}; no se puede cotizar con este asesor.`;
}
