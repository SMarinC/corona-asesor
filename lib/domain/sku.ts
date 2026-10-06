/**
 * 18 wall tiles are stored with a trailing "." in their SKU ("401072001."), and the model tends to drop it.
 * The stored spelling stays canonical in every output; this key (no trailing period) is only for comparing
 * and indexing, so both spellings are the same SKU.
 */
export const skuKey = (sku: string): string => sku.replace(/\.+$/, "");
