import { readFileSync } from "node:fs";
import path from "node:path";
import type { SheetChunk } from "@/lib/domain/types";
import { DATA_DIR } from "./catalog";

let byId: Map<string, SheetChunk> | null = null;

function load(): Map<string, SheetChunk> {
  if (!byId) {
    const chunks = JSON.parse(readFileSync(path.join(DATA_DIR, "sheets.json"), "utf8")) as SheetChunk[];
    byId = new Map(chunks.map((chunk) => [chunk.citationId, chunk]));
  }
  return byId;
}

/** One technical-sheet fragment by citation id. Reads only sheets.json, never the vector index. */
export function getSheetChunk(citationId: string): SheetChunk | undefined {
  return load().get(citationId);
}

/** Every citation id in the snapshot, for prerendering. */
export function listSheetChunkIds(): string[] {
  return [...load().keys()];
}
