import { parseKg } from "./parse";
import type { Product } from "./types";

/**
 * The name the model and the customer see, derived from catalog data only. Some adhesive SKUs share a name across
 * bag sizes ("PEGACOR® Interiores Gris" comes in 10 kg and 25 kg), so an adhesive whose name states no weight gets
 * its bag size appended: "PEGACOR® Interiores Gris · 10 kg". Every other name is the catalog's own.
 */
export function displayName(product: Product): string {
  if (product.kind !== "adhesive" || product.bagKg === null || parseKg(product.name) !== null) return product.name;
  return `${product.name} · ${String(product.bagKg).replace(".", ",")} kg`;
}
