import { parseNumbers } from "./parse";
import type { SheetChunk } from "./types";

export interface CitedValue {
  value: number;
  citationId: string;
}

export type CitationCheck =
  | { ok: true }
  | { ok: false; reason: "unknown_citation" | "citation_other_product" | "value_not_in_citation" };

const EPSILON = 1e-9;

export function numberAppearsIn(text: string, value: number): boolean {
  return parseNumbers(text).some((n) => Math.abs(n - value) < EPSILON);
}

/**
 * A value the model read from a technical sheet is accepted only if the cited
 * chunk exists, belongs to the same product, and literally contains the number.
 */
export function verifyCitedValue(
  cited: CitedValue,
  sku: string,
  findChunk: (citationId: string) => SheetChunk | undefined,
): CitationCheck {
  const chunk = findChunk(cited.citationId);
  if (!chunk) return { ok: false, reason: "unknown_citation" };
  if (!chunk.skus.includes(sku)) return { ok: false, reason: "citation_other_product" };
  if (!numberAppearsIn(chunk.text, cited.value)) return { ok: false, reason: "value_not_in_citation" };
  return { ok: true };
}
