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
 * The calculations a conversation's quotes are checked against: the latest one per tile. A later call for the same
 * tile replaces the earlier one (last call wins, so a superseded what-if is caught); tiles not recalculated since
 * the previous quote keep their calculation, so a re-quote with no new calculation keeps the full set.
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
  // The latest calculation per tile that any quote so far has been checked against.
  const forQuote = new Map<string, CalcQuantities>();
  return {
    recordCalculation(tileSku, quantities) {
      pending = [...pending.filter((call) => call.tileSku !== tileSku), { tileSku, quantities }];
    },
    takeForQuote() {
      for (const call of pending) forQuote.set(call.tileSku, call.quantities);
      pending = [];
      return [...forQuote.values()];
    },
    hasPendingCalculations: () => pending.length > 0,
  };
}
