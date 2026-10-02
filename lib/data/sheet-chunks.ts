import { readFileSync } from "node:fs";
import path from "node:path";
import type { SheetChunk } from "@/lib/domain/types";
import { DATA_DIR } from "./catalog";

let byId: Map<string, SheetChunk> | null = null;

/** One technical-sheet fragment by citation id. Reads only sheets.json, never the vector index. */
export function getSheetChunk(citationId: string): SheetChunk | undefined {
  if (!byId) {
    const chunks = JSON.parse(readFileSync(path.join(DATA_DIR, "sheets.json"), "utf8")) as SheetChunk[];
    byId = new Map(chunks.map((chunk) => [chunk.citationId, chunk]));
  }
  return byId.get(citationId);
}
