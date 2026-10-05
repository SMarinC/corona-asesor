/** How a quote line's quantity relates to what the materials calculator returned for that SKU. */
export type LineCheck = "computed" | "differs" | "not_computed";

/** The purchase quantities of one computeMaterials result: boxes, bags and units, keyed by product. */
export interface CalcQuantities {
  tile?: { sku: string; boxes: number } | null;
  adhesive?: { sku: string; bags: number } | null;
  grout?: { sku: string; units: number } | null;
}

/**
 * A line is "computed" when its quantity equals one calculation's value for that SKU, or the sum over all of
 * them (one adhesive shared by a floor and a wall); "differs" when the SKU was calculated with other values;
 * "not_computed" when no calculation produced it at all.
 */
export function checkQuoteQuantities(calcs: CalcQuantities[], lines: { sku: string; quantity: number }[]): Record<string, LineCheck> {
  const computed = new Map<string, number[]>();
  const add = (sku: string, value: number) => computed.set(sku, [...(computed.get(sku) ?? []), value]);
  for (const calc of calcs) {
    if (calc.tile) add(calc.tile.sku, calc.tile.boxes);
    if (calc.adhesive) add(calc.adhesive.sku, calc.adhesive.bags);
    if (calc.grout) add(calc.grout.sku, calc.grout.units);
  }
  const checks: Record<string, LineCheck> = {};
  for (const line of lines) {
    const values = computed.get(line.sku);
    const sum = values?.reduce((a, b) => a + b, 0);
    checks[line.sku] = values === undefined ? "not_computed" : values.includes(line.quantity) || sum === line.quantity ? "computed" : "differs";
  }
  return checks;
}

/**
 * The calculations a conversation's quotes are checked against. A quote is checked against the calculations
 * completed since the previous quote (a later call for the same tile replaces an earlier one: last call wins);
 * a re-quote with no new calculation keeps the previous set.
 */
export interface QuantityLedger {
  recordCalculation(tileSku: string, quantities: CalcQuantities): void;
  /** The set the next quote is checked against. Call once per quote. */
  takeForQuote(): CalcQuantities[];
  /** True when a calculation finished after the latest quote, so that quote may no longer match the numbers. */
  hasPendingCalculations(): boolean;
}

export function createQuantityLedger(): QuantityLedger {
  let pending: { tileSku: string; quantities: CalcQuantities }[] = [];
  let forQuote: CalcQuantities[] = [];
  return {
    recordCalculation(tileSku, quantities) {
      pending = [...pending.filter((call) => call.tileSku !== tileSku), { tileSku, quantities }];
    },
    takeForQuote() {
      if (pending.length > 0) forQuote = pending.map((call) => call.quantities);
      pending = [];
      return forQuote;
    },
    hasPendingCalculations: () => pending.length > 0,
  };
}
