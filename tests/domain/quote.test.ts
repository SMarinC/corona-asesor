import { describe, expect, it } from "vitest";
import { buildQuote } from "@/lib/domain/quote";
import type { Product } from "@/lib/domain/types";
import { makeAdhesive, makeGrout, makeTile } from "@/tests/fixtures/products";

const products: Product[] = [
  makeTile({ sku: "T1", price: 89900 }),
  makeAdhesive({ sku: "A1", price: 42900 }),
  makeGrout({ sku: "G1", price: null }),
];
const find = (sku: string) => products.find((p) => p.sku === sku);

describe("buildQuote", () => {
  it("prices every line from the catalog and checks the budget", () => {
    const result = buildQuote([{ sku: "T1", quantity: 10 }, { sku: "A1", quantity: 3 }], find, 2_500_000);
    expect(result).toEqual({
      ok: true,
      quote: {
        lines: [
          { sku: "T1", name: "Piso Prueba Blanco 60x60", kind: "tile", quantity: 10, unitPrice: 89900, subtotal: 899000, url: "https://corona.co/p/T1" },
          { sku: "A1", name: "PEGACOR® Cerámico Gris · 25 kg", kind: "adhesive", quantity: 3, unitPrice: 42900, subtotal: 128700, url: null },
        ],
        total: 1_027_700,
        missingPrices: [],
        budget: 2_500_000,
        withinBudget: true,
        difference: 1_472_300,
      },
    });
  });

  it("reports an exceeded budget with a negative difference", () => {
    const result = buildQuote([{ sku: "T1", quantity: 30 }], find, 2_500_000);
    expect(result.ok && result.quote.withinBudget).toBe(false);
    expect(result.ok && result.quote.difference).toBe(-197_000);
  });

  it("leaves the budget verdict open (null) when no budget is given", () => {
    const result = buildQuote([{ sku: "T1", quantity: 1 }], find);
    expect(result.ok && result.quote.withinBudget).toBeNull();
    expect(result.ok && result.quote.difference).toBeNull();
  });

  it("does not claim a budget verdict when a price is missing", () => {
    const result = buildQuote([{ sku: "T1", quantity: 1 }, { sku: "G1", quantity: 1 }], find, 1_000_000);
    expect(result.ok && result.quote.missingPrices).toEqual(["G1"]);
    expect(result.ok && result.quote.withinBudget).toBeNull();
  });

  it("refuses unknown SKUs instead of inventing lines", () => {
    expect(buildQuote([{ sku: "NOPE", quantity: 1 }], find)).toEqual({ ok: false, unknownSkus: ["NOPE"] });
  });

  it("rejects non-positive or fractional quantities", () => {
    expect(() => buildQuote([{ sku: "T1", quantity: 0 }], find)).toThrow(RangeError);
    expect(() => buildQuote([{ sku: "T1", quantity: 1.5 }], find)).toThrow(RangeError);
  });
});
