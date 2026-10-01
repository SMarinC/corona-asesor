import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assertSheetsMatchManifest, createSheetSearch, keywordSearch, loadSheetArtifacts } from "@/lib/data/sheets";
import { dequantizeRow, decodeIndex, encodeIndex } from "@/lib/data/vector";
import type { SheetChunk } from "@/lib/domain/types";

const chunks: SheetChunk[] = [
  { citationId: "c0001", skus: ["T1"], section: "ficha_general", docType: "revestimiento", text: "M2 POR CAJA 1,8 Tráfico residencial" },
  { citationId: "c0002", skus: ["A1"], section: "USOS", docType: "materiales_pinturas", text: "Para porcelanato en exteriores" },
  { citationId: "c0003", skus: ["T1", "T2"], section: "USO PARED", docType: "revestimiento", text: "Instalación en pared de baño" },
];
const index = decodeIndex(encodeIndex([[1, 0, 0], [0, 1, 0], [0, 0, 1]], 3), 3, 3);

describe("createSheetSearch", () => {
  it("searches semantically when the query embeds", async () => {
    const search = createSheetSearch({ chunks, index, embedQuery: async () => [0, 1, 0.1] });
    const result = await search.search("pegante porcelanato");
    expect(result.mode).toBe("semantic");
    expect(result.hits[0].chunk.citationId).toBe("c0002");
  });

  it("filters by SKU", async () => {
    const search = createSheetSearch({ chunks, index, embedQuery: async () => [0, 1, 0] });
    const result = await search.search("cualquier cosa", { sku: "T1", k: 5 });
    expect(result.hits.map((h) => h.chunk.citationId).sort()).toEqual(["c0001", "c0003"]);
  });

  it("falls back to keywords when embedding fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const search = createSheetSearch({ chunks, index, embedQuery: async () => { throw new Error("quota"); } });
    const result = await search.search("metros por caja tráfico");
    expect(result.mode).toBe("keyword");
    expect(result.hits[0].chunk.citationId).toBe("c0001");
    warn.mockRestore();
  });

  it("resolves chunks by citation id", () => {
    const search = createSheetSearch({ chunks, index, embedQuery: async () => [1, 0, 0] });
    expect(search.getChunk("c0003")?.skus).toEqual(["T1", "T2"]);
  });
});

describe("keywordSearch", () => {
  it("ignores accents and short words", () => {
    expect(keywordSearch(chunks, "instalacion de pared", 3).map((h) => h.chunk.citationId)).toEqual(["c0003"]);
  });
});

describe("loadSheetArtifacts (data/)", () => {
  it("loads an index aligned with the chunks, and each row retrieves itself", () => {
    const { chunks: real, index: realIndex } = loadSheetArtifacts();
    expect(realIndex.count).toBe(real.length);
    expect(realIndex.dims).toBe(768);
    const row = Math.floor(real.length / 2);
    const search = createSheetSearch({ chunks: real, index: realIndex, embedQuery: async () => Array.from(dequantizeRow(realIndex, row)) });
    return search.search("x", { k: 1 }).then((r) => expect(r.hits[0].chunk.citationId).toBe(real[row].citationId));
  });
});

describe("assertSheetsMatchManifest", () => {
  const bytes = new TextEncoder().encode("[]");
  const hash = createHash("sha256").update(bytes).digest("hex");

  it("accepts a matching chunk count and hash", () => {
    expect(() => assertSheetsMatchManifest(bytes, 3, { chunks: 3, sheetsSha256: hash })).not.toThrow();
    expect(() => assertSheetsMatchManifest(bytes, 3, { chunks: 3 })).not.toThrow();
  });
  it("throws on a chunk count mismatch", () => {
    expect(() => assertSheetsMatchManifest(bytes, 3, { chunks: 4 })).toThrow(/chunks/);
  });
  it("throws on a hash mismatch", () => {
    expect(() => assertSheetsMatchManifest(bytes, 3, { chunks: 3, sheetsSha256: "0".repeat(64) })).toThrow(/sha256/);
  });
});
