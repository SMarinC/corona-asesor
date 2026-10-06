import { describe, expect, it } from "vitest";
import { createBuildQuoteTool } from "@/lib/agent/tools/build-quote";
import { createComputeMaterialsTool } from "@/lib/agent/tools/compute-materials";
import { executeGetProduct } from "@/lib/agent/tools/get-product";
import { executeSearchTechnicalSheets } from "@/lib/agent/tools/search-technical-sheets";
import { checkQuoteQuantities, createQuantityLedger } from "@/lib/domain/quantity-check";
import { getCatalog } from "@/lib/data/catalog";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { callTool } from "@/tests/helpers/call-tool";

// A real wall tile whose stored SKU ends in "." (18 of them do); the model tends to drop the dot.
const STORED = "401072001.";
const BARE = "401072001";

const realDeps = () => ({ ...makeToolDeps(), catalog: getCatalog(), quantities: createQuantityLedger() });

describe("SKUs stored with a trailing period", () => {
  it("the real catalog has such a SKU", () => {
    expect(getCatalog().all.some((p) => p.sku === STORED)).toBe(true);
  });

  it("getProduct resolves both spellings to the stored product", () => {
    for (const sku of [STORED, BARE]) {
      const result = executeGetProduct(realDeps(), { sku });
      expect(result).toMatchObject({ status: "ok", data: { product: { sku: STORED } } });
    }
  });

  it("searchTechnicalSheets accepts the bare SKU and filters by the stored one", async () => {
    const deps = realDeps();
    const calls: unknown[] = [];
    deps.sheets = { ...deps.sheets, search: async (_q, options) => { calls.push(options?.sku); return { mode: "semantic", hits: [] }; } };
    const result = await executeSearchTechnicalSheets(deps, { query: "m2 por caja", sku: BARE });
    expect(result.status).toBe("ok");
    expect(calls).toEqual([STORED]);
  });

  it("buildQuote prices the bare SKU and reports the stored one", async () => {
    const quote = await callTool<{ status: string; data: { lines: { sku: string }[] } }>(createBuildQuoteTool(realDeps()), { lines: [{ sku: BARE, quantity: 2 }] });
    expect(quote.status).not.toBe("error");
    expect(quote.data.lines[0].sku).toBe(STORED);
  });

  it("merges the two spellings into one line", async () => {
    const quote = await callTool<{ data: { lines: { quantity: number }[]; mergedDuplicates: string[] } }>(createBuildQuoteTool(realDeps()), {
      lines: [{ sku: BARE, quantity: 1 }, { sku: STORED, quantity: 2 }],
    });
    expect(quote.data.lines).toHaveLength(1);
    expect(quote.data.lines[0].quantity).toBe(3);
  });

  it("the ledger ties a quote to computeMaterials whichever spelling each call used", async () => {
    const deps = realDeps();
    const materials = await callTool<{ data: { tile: { boxes: number } } }>(createComputeMaterialsTool(deps), { lengthM: 3, widthM: 2, tileSku: BARE });
    const { boxes } = materials.data.tile;
    const quote = await callTool(createBuildQuoteTool(deps), { lines: [{ sku: BARE, quantity: boxes }] });
    expect(quote).toMatchObject({ status: "ok" });
    const deps2 = realDeps();
    await callTool(createComputeMaterialsTool(deps2), { lengthM: 3, widthM: 2, tileSku: STORED });
    const quote2 = await callTool(createBuildQuoteTool(deps2), { lines: [{ sku: BARE, quantity: boxes }] });
    expect(quote2).toMatchObject({ status: "ok" });
  });

  it("checkQuoteQuantities treats the spellings as one SKU", () => {
    const checks = checkQuoteQuantities([{ tile: { sku: STORED, boxes: 4 } }], [{ sku: BARE, quantity: 4 }]);
    expect(checks[BARE]).toBe("computed");
  });
});
