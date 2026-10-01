import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { errorMessage, log } from "@/lib/log";
import { round } from "@/lib/domain/calculations";
import { normalizeText } from "@/lib/domain/parse";
import type { SheetChunk } from "@/lib/domain/types";
import { DATA_DIR } from "./catalog";
import { decodeIndex, EMBEDDING_DIMENSIONS, type QuantizedIndex, topK } from "./vector";

export type EmbedQuery = (query: string) => Promise<number[]>;

export interface SheetHit {
  chunk: SheetChunk;
  score: number;
}

export interface SheetSearchResult {
  mode: "semantic" | "keyword";
  hits: SheetHit[];
}

export interface SheetSearch {
  getChunk(citationId: string): SheetChunk | undefined;
  search(query: string, options?: { sku?: string; k?: number }): Promise<SheetSearchResult>;
}

const STOPWORDS = new Set([
  "para", "como", "cual", "cuales", "este", "esta", "estos", "unos", "unas", "sobre", "pero", "segun",
  "tiene", "cuanto", "necesito", "quiero", "puede", "debe", "producto", "desde", "hasta", "entre", "donde",
]);

export function keywordSearch(
  chunks: SheetChunk[],
  query: string,
  k: number,
  allow: (row: number) => boolean = () => true,
): SheetHit[] {
  const terms = [...new Set(normalizeText(query).split(/[^a-z0-9]+/))].filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  if (terms.length === 0) return [];
  const hits: SheetHit[] = [];
  chunks.forEach((chunk, row) => {
    if (!allow(row)) return;
    const text = normalizeText(chunk.text);
    const matched = terms.filter((t) => text.includes(t)).length;
    if (matched > 0) hits.push({ chunk, score: round(matched / terms.length, 4) });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

export function createSheetSearch(deps: { chunks: SheetChunk[]; index: QuantizedIndex; embedQuery: EmbedQuery }): SheetSearch {
  const byId = new Map(deps.chunks.map((c) => [c.citationId, c]));
  return {
    getChunk: (citationId) => byId.get(citationId),
    async search(query, { sku, k = 4 } = {}) {
      const allow = (row: number) => !sku || deps.chunks[row].skus.includes(sku);
      try {
        const vector = await deps.embedQuery(query);
        const hits = topK(deps.index, vector, k, allow).map(({ row, score }) => ({
          chunk: deps.chunks[row],
          score: round(score, 4),
        }));
        return { mode: "semantic", hits };
      } catch (error) {
        log("warn", "sheet_search_fallback", { mode: "keyword", message: errorMessage(error) });
        return { mode: "keyword", hits: keywordSearch(deps.chunks, query, k, allow) };
      }
    },
  };
}

export interface SheetsManifest {
  chunks: number;
  sheetsSha256?: string;
}

/** Throws when data/sheets.json is not the file the embedding index was built from. */
export function assertSheetsMatchManifest(sheetsBytes: Uint8Array, chunkCount: number, manifest: SheetsManifest): void {
  if (manifest.chunks !== chunkCount) {
    throw new Error(`data/manifest.json lists ${manifest.chunks} chunks but data/sheets.json has ${chunkCount}; re-run npm run data:embed.`);
  }
  if (manifest.sheetsSha256 !== undefined) {
    const actual = createHash("sha256").update(sheetsBytes).digest("hex");
    if (actual !== manifest.sheetsSha256) {
      throw new Error("data/sheets.json sha256 differs from data/manifest.json; the index was built from other chunks. Re-run npm run data:embed.");
    }
  }
}

export function loadSheetArtifacts(): { chunks: SheetChunk[]; index: QuantizedIndex } {
  const sheetsBytes = readFileSync(path.join(DATA_DIR, "sheets.json"));
  const chunks = JSON.parse(sheetsBytes.toString("utf8")) as SheetChunk[];
  const manifest = JSON.parse(readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8")) as SheetsManifest;
  assertSheetsMatchManifest(sheetsBytes, chunks.length, manifest);
  const bytes = new Uint8Array(readFileSync(path.join(DATA_DIR, "sheets.index.bin")));
  return { chunks, index: decodeIndex(bytes, chunks.length, EMBEDDING_DIMENSIONS) };
}
