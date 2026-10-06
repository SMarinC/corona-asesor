import { round } from "./calculations";
import { displayName } from "./display-name";
import type { Product } from "./types";

export interface QuoteLineInput {
  sku: string;
  quantity: number;
}

export interface QuoteLine {
  sku: string;
  name: string;
  kind: Product["kind"];
  quantity: number;
  unitPrice: number | null;
  subtotal: number | null;
  url: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  /** Sum of priced lines only. */
  total: number;
  missingPrices: string[];
  budget: number | null;
  /** `null` when there is no budget or some price is missing. */
  withinBudget: boolean | null;
  difference: number | null;
}

export type BuildQuoteResult = { ok: true; quote: Quote } | { ok: false; unknownSkus: string[] };

/** Prices always come from the catalog — never from the model. */
export function buildQuote(
  inputs: QuoteLineInput[],
  findProduct: (sku: string) => Product | undefined,
  budget: number | null = null,
): BuildQuoteResult {
  for (const input of inputs) {
    if (!(Number.isInteger(input.quantity) && input.quantity > 0)) {
      throw new RangeError(`quantity for ${input.sku} must be a positive integer, got ${input.quantity}`);
    }
  }
  const unknownSkus = inputs.filter((i) => !findProduct(i.sku)).map((i) => i.sku);
  if (unknownSkus.length > 0) return { ok: false, unknownSkus };

  const lines: QuoteLine[] = inputs.map((input) => {
    const product = findProduct(input.sku)!;
    return {
      sku: product.sku,
      name: displayName(product),
      kind: product.kind,
      quantity: input.quantity,
      unitPrice: product.price,
      subtotal: product.price === null ? null : round(product.price * input.quantity),
      url: product.url,
    };
  });
  const total = round(lines.reduce((sum, l) => sum + (l.subtotal ?? 0), 0));
  const missingPrices = lines.filter((l) => l.unitPrice === null).map((l) => l.sku);
  const decidable = budget !== null && missingPrices.length === 0;
  return {
    ok: true,
    quote: {
      lines,
      total,
      missingPrices,
      budget,
      withinBudget: decidable ? total <= budget : null,
      difference: decidable ? round(budget - total) : null,
    },
  };
}
