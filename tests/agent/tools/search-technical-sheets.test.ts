import { describe, expect, it, vi } from "vitest";
import { executeSearchTechnicalSheets, MAX_HIT_CHARS, searchTechnicalSheetsInput, toHitData } from "@/lib/agent/tools/search-technical-sheets";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

describe("searchTechnicalSheets tool", () => {
  it("restricts hits to the requested SKU and returns citation ids", async () => {
    const result = await executeSearchTechnicalSheets(makeToolDeps(), { query: "metros cuadrados por caja", sku: "T2" });
    expect(result).toMatchObject({ status: "ok", data: { mode: "semantic" } });
    if (result.status !== "ok") return;
    expect(result.data.hits.map((h) => h.citationId)).toEqual(["c0003"]);
    expect(result.data.hits[0]).toMatchObject({ skus: ["T2"], skuCount: 1, truncated: false });
  });

  it("falls back to keyword search when the embedder fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeToolDeps({ embedQuery: async () => { throw new Error("429 quota"); } });
    const result = await executeSearchTechnicalSheets(deps, { query: "boquilla juntas" });
    expect(result).toMatchObject({ status: "ok", data: { mode: "keyword" } });
    if (result.status === "ok") expect(result.data.hits[0].citationId).toBe("c0002");
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: "sheet_search_fallback", message: "429 quota" });
    warn.mockRestore();
  });

  it("rejects unknown SKUs as data", async () => {
    expect(await executeSearchTechnicalSheets(makeToolDeps(), { query: "rendimiento", sku: "ZZ9" })).toMatchObject({ status: "error", code: "unknown_sku" });
  });

  it("truncates very long chunks and caps the SKU list", () => {
    const skus = Array.from({ length: 15 }, (_, i) => `S${i}`);
    const hit = toHitData({ chunk: { citationId: "c9999", skus, section: "X", docType: "Y", text: "a".repeat(MAX_HIT_CHARS + 500) }, score: 0.5 });
    expect(hit.text).toHaveLength(MAX_HIT_CHARS + 1);
    expect(hit).toMatchObject({ truncated: true, skuCount: 15 });
    expect(hit.skus).toHaveLength(10);
  });

  it("validates the query length and k", () => {
    expect(searchTechnicalSheetsInput.safeParse({ query: "ab" }).success).toBe(false);
    expect(searchTechnicalSheetsInput.safeParse({ query: "rendimiento", k: 7 }).success).toBe(false);
  });
});
