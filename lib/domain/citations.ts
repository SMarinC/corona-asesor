import { normalizeText } from "./parse";
import type { SheetChunk } from "./types";

export interface CitedValue {
  value: number;
  citationId: string;
}

export type CitationField = "m2PerBox" | "coverageKgM2" | "bagKg";

export type CitationCheck =
  | { ok: true }
  | { ok: false; reason: "unknown_citation" | "citation_other_product" | "value_not_in_citation" };

const EPSILON = 1e-9;

const toNumber = (raw: string) => Number(raw.replace(",", "."));
const matches = (candidates: number[], value: number) => candidates.some((n) => Math.abs(n - value) < EPSILON);

// A standalone number: not glued to letters/digits/separators ("H1I1", "2017", "m2" do not count).
const STANDALONE_NUMBER = /(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)(?![\p{L}\d])/gu;
const BOX_LABEL = /m(?:2|²) por caja|metros cuadrados por caja/g;
const BOX_WINDOW = 40;
const COVERAGE = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|a)\s*(\d+(?:[.,]\d+)?))?\s*kg\s*\/?\s*m\s*(?:2|²)/g;
const KG_AMOUNT = /(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s*kg\b(?!\s*\/?\s*m)/gu;

function numbersAfterBoxLabel(text: string): number[] {
  const out: number[] = [];
  for (const label of text.matchAll(BOX_LABEL)) {
    const from = (label.index ?? 0) + label[0].length;
    const window = text.slice(from, from + BOX_WINDOW);
    for (const m of window.matchAll(STANDALONE_NUMBER)) out.push(toNumber(m[1]));
  }
  return out;
}

/** The one m² per box value a sheet text labels ("M2 POR CAJA ... 2"), or null when it states none or several. */
export function statedM2PerBox(text: string): number | null {
  const values = [...new Set(numbersAfterBoxLabel(normalizeText(text)))].filter((n) => n > 0);
  return values.length === 1 ? values[0] : null;
}

function coverageBounds(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(COVERAGE)) {
    // Only the upper end of a range (or a standalone figure): coverage is used conservatively.
    out.push(toNumber(m[2] ?? m[1]));
  }
  return out;
}

function bagAmounts(text: string): number[] {
  return [...text.matchAll(KG_AMOUNT)].map((m) => toNumber(m[1]));
}

function valueAppearsInField(text: string, value: number, field: CitationField): boolean {
  const normalized = normalizeText(text);
  switch (field) {
    case "m2PerBox":
      return matches(numbersAfterBoxLabel(normalized), value);
    case "coverageKgM2":
      return matches(coverageBounds(normalized), value);
    case "bagKg":
      return matches(bagAmounts(normalized), value);
  }
}

/**
 * A value the model read from a technical sheet is accepted only if the cited
 * chunk exists, belongs to the same product, and contains the number in the
 * context of the field being cited (e.g. "M2 POR CAJA ... 1,8").
 */
export function verifyCitedValue(
  cited: CitedValue,
  sku: string,
  findChunk: (citationId: string) => SheetChunk | undefined,
  field: CitationField,
): CitationCheck {
  const chunk = findChunk(cited.citationId);
  if (!chunk) return { ok: false, reason: "unknown_citation" };
  if (!chunk.skus.includes(sku)) return { ok: false, reason: "citation_other_product" };
  if (!valueAppearsInField(chunk.text, cited.value, field)) return { ok: false, reason: "value_not_in_citation" };
  return { ok: true };
}
