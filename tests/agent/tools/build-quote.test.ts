import { describe, expect, it } from "vitest";
import { buildQuoteInput, executeBuildQuote, mergeDuplicateLines } from "@/lib/agent/tools/build-quote";
import { getToolDeps } from "@/lib/agent/tools";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const deps = makeToolDeps();

describe("buildQuote tool", () => {
  it("prices every line from the catalog and compares with the budget", () => {
    const result = executeBuildQuote(deps, { lines: [{ sku: "T1", quantity: 5 }, { sku: "A1", quantity: 2 }], budget: 500000, projectSummary: "Baño 3 x 2 m" });
    expect(result).toMatchObject({
      status: "ok",
      data: {
        total: 474800,
        withinBudget: true,
        difference: 25200,
        currency: "COP",
        projectSummary: "Baño 3 x 2 m",
        lines: [
          { sku: "T1", quantity: 5, unitPrice: 80000, subtotal: 400000, unit: "caja" },
          { sku: "A1", quantity: 2, unitPrice: 37400, subtotal: 74800, unit: "bulto" },
        ],
      },
    });
  });

  it("leaves withinBudget null when there is no budget", () => {
    expect(executeBuildQuote(deps, { lines: [{ sku: "G1", quantity: 1 }] })).toMatchObject({ data: { budget: null, withinBudget: null, difference: null } });
  });

  it("merges duplicate SKUs and reports them", () => {
    const result = executeBuildQuote(deps, { lines: [{ sku: "T1", quantity: 2 }, { sku: "T1", quantity: 3 }] });
    expect(result).toMatchObject({ data: { lines: [{ sku: "T1", quantity: 5, subtotal: 400000 }], total: 400000, mergedDuplicates: ["T1"] } });
    if (result.status === "ok") expect(result.data.lines).toHaveLength(1);
    expect(mergeDuplicateLines([{ sku: "A", quantity: 1 }])).toEqual({ lines: [{ sku: "A", quantity: 1 }], duplicates: [] });
  });

  it("flags lines without a catalog price as needs_review", () => {
    const result = executeBuildQuote(deps, { lines: [{ sku: "T4", quantity: 3 }], budget: 100000 });
    expect(result).toMatchObject({ status: "needs_review", missing: [{ field: "price:T4" }], data: { withinBudget: null } });
  });

  it("excludes unpriced lines from the total of a mixed quote", () => {
    const result = executeBuildQuote(deps, { lines: [{ sku: "T1", quantity: 1 }, { sku: "T4", quantity: 3 }], budget: 100000 });
    expect(result).toMatchObject({ status: "needs_review", missing: [{ field: "price:T4" }], data: { total: 80000, withinBudget: null } });
  });

  it("refuses unknown SKUs without producing a quote", () => {
    const result = executeBuildQuote(deps, { lines: [{ sku: "T1", quantity: 1 }, { sku: "ZZ9", quantity: 1 }] });
    expect(result).toMatchObject({ status: "error", code: "unknown_sku" });
    expect(result).not.toHaveProperty("data");
  });

  it("can omit product links", () => {
    expect(executeBuildQuote(deps, { lines: [{ sku: "T1", quantity: 1 }], includeLinks: false })).toMatchObject({ data: { lines: [{ url: null }] } });
  });

  it("ignores prices sent by the model and rejects bad budgets or quantities", () => {
    const parsed = buildQuoteInput.parse({ lines: [{ sku: "T1", quantity: 1, unitPrice: 1 }] });
    expect(parsed.lines[0]).toEqual({ sku: "T1", quantity: 1 });
    expect(executeBuildQuote(deps, parsed)).toMatchObject({ data: { total: 80000 } });
    expect(buildQuoteInput.safeParse({ lines: [{ sku: "T1", quantity: 1 }], budget: 0 }).success).toBe(false);
    expect(buildQuoteInput.safeParse({ lines: [{ sku: "T1", quantity: 1 }], budget: -5 }).success).toBe(false);
    expect(buildQuoteInput.safeParse({ lines: [{ sku: "T1", quantity: 1.5 }] }).success).toBe(false);
    expect(buildQuoteInput.safeParse({ lines: [] }).success).toBe(false);
  });
});

describe("buildQuote on the real catalog", () => {
  it("names a quote line with its bag size, so the customer can tell same-name adhesives apart", () => {
    const result = executeBuildQuote(getToolDeps(), { lines: [{ sku: "901061501", quantity: 1 }, { sku: "901021501", quantity: 1 }] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.lines.map((line) => line.name)).toEqual(["PEGACOR® Interiores Gris · 10 kg", "PEGACOR® Interiores Gris · 25 kg"]);
  });
});
