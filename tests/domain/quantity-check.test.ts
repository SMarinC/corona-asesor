import { describe, expect, it } from "vitest";
import { checkQuoteQuantities, createQuantityLedger } from "@/lib/domain/quantity-check";

const floor = { tile: { sku: "T1", boxes: 5 }, adhesive: { sku: "A1", bags: 2 }, grout: { sku: "G1", units: 1 } };
const wall = { tile: { sku: "T2", boxes: 7 }, adhesive: { sku: "A1", bags: 3 }, grout: null };

describe("checkQuoteQuantities", () => {
  it("accepts quantities a calculation produced and flags the rest", () => {
    expect(
      checkQuoteQuantities([floor], [
        { sku: "T1", quantity: 5 },
        { sku: "A1", quantity: 3 },
        { sku: "G9", quantity: 3 },
      ]),
    ).toEqual({ T1: "computed", A1: "differs", G9: "not_computed" });
  });

  it("accepts the sum of a supply shared by two surfaces", () => {
    expect(checkQuoteQuantities([floor, wall], [{ sku: "T1", quantity: 5 }, { sku: "T2", quantity: 7 }, { sku: "A1", quantity: 5 }])).toEqual({
      T1: "computed",
      T2: "computed",
      A1: "computed",
    });
  });

  it("flags a supply summed across surfaces when the quote only includes one of the tiles", () => {
    expect(checkQuoteQuantities([floor, wall], [{ sku: "T2", quantity: 7 }, { sku: "A1", quantity: 5 }])).toEqual({ T2: "computed", A1: "differs" });
  });

  it("does not let another tile alternative's supply quantity pass", () => {
    const alt1 = { tile: { sku: "T1", boxes: 5 }, grout: { sku: "G1", units: 6 } };
    const alt3 = { tile: { sku: "T3", boxes: 5 }, grout: { sku: "G1", units: 8 } };
    expect(checkQuoteQuantities([alt1, alt3], [{ sku: "T3", quantity: 5 }, { sku: "G1", quantity: 6 }])).toEqual({ T3: "computed", G1: "differs" });
    expect(checkQuoteQuantities([alt1, alt3], [{ sku: "T3", quantity: 5 }, { sku: "G1", quantity: 8 }])).toEqual({ T3: "computed", G1: "computed" });
  });

  it("checks supplies against every calculation when the quote has no tile line", () => {
    expect(checkQuoteQuantities([floor, wall], [{ sku: "A1", quantity: 5 }])).toEqual({ A1: "computed" });
  });

  it("flags every line when nothing was calculated", () => {
    expect(checkQuoteQuantities([], [{ sku: "T1", quantity: 5 }])).toEqual({ T1: "not_computed" });
  });
});

describe("createQuantityLedger", () => {
  it("lets the last calculation for a tile win until the next quote", () => {
    const ledger = createQuantityLedger();
    ledger.recordCalculation("T1", { tile: { sku: "T1", boxes: 5 } });
    ledger.recordCalculation("T1", { tile: { sku: "T1", boxes: 10 } });
    expect(ledger.takeForQuote()).toEqual([{ tile: { sku: "T1", boxes: 10 } }]);
  });

  it("keeps the previous set for a re-quote with no new calculation, and reports later calculations as pending", () => {
    const ledger = createQuantityLedger();
    ledger.recordCalculation("T1", floor);
    expect(ledger.takeForQuote()).toEqual([floor]);
    expect(ledger.takeForQuote()).toEqual([floor]);
    expect(ledger.hasPendingCalculations()).toBe(false);
    ledger.recordCalculation("T2", wall);
    expect(ledger.hasPendingCalculations()).toBe(true);
  });

  it("accumulates different tiles between quotes", () => {
    const ledger = createQuantityLedger();
    ledger.recordCalculation("T1", floor);
    ledger.recordCalculation("T2", wall);
    expect(ledger.takeForQuote()).toEqual([floor, wall]);
  });
});

describe("createQuantityLedger: per-tile carry-forward", () => {
  it("keeps the floor's calculation when only the wall is calculated before the next quote", () => {
    const ledger = createQuantityLedger();
    ledger.recordCalculation("T1", floor);
    ledger.takeForQuote();
    ledger.recordCalculation("T2", wall);
    const calcs = ledger.takeForQuote();
    expect(calcs).toEqual([floor, wall]);
    expect(checkQuoteQuantities(calcs, [{ sku: "T1", quantity: 5 }, { sku: "T2", quantity: 7 }, { sku: "A1", quantity: 5 }])).toEqual({
      T1: "computed",
      T2: "computed",
      A1: "computed",
    });
  });

  it("replaces a recomputed tile, so the superseded value is caught", () => {
    const ledger = createQuantityLedger();
    ledger.recordCalculation("T1", floor);
    ledger.takeForQuote();
    ledger.recordCalculation("T1", { ...floor, tile: { sku: "T1", boxes: 9 } });
    expect(checkQuoteQuantities(ledger.takeForQuote(), [{ sku: "T1", quantity: 5 }])).toEqual({ T1: "differs" });
  });

  it("still flags an invented line added to a re-quote", () => {
    const ledger = createQuantityLedger();
    ledger.recordCalculation("T1", floor);
    ledger.takeForQuote();
    expect(checkQuoteQuantities(ledger.takeForQuote(), [{ sku: "T1", quantity: 5 }, { sku: "G9", quantity: 2 }])).toEqual({ T1: "computed", G9: "not_computed" });
  });
});
