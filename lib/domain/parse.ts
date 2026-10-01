import type { FormatMm, Range } from "./types";

const NUMBER = /\d+(?:[.,]\d+)?/g;
const FORMAT = /(\d{1,3}(?:[.,]\d+)?)\s*[xX×]\s*(\d{1,3}(?:[.,]\d+)?)/;
const KG_M2_RANGE = /(\d+(?:[.,]\d+)?)\s*(?:-|–|a)\s*(\d+(?:[.,]\d+)?)\s*kg\s*\/?\s*m\s*(?:2|²)/i;
const KG_M2_SINGLE = /(\d+(?:[.,]\d+)?)\s*kg\s*\/?\s*m\s*(?:2|²)/i;
const KG = /(\d+(?:[.,]\d+)?)\s*kg\b/i;
const JOINT_PATTERNS = [
  /juntas?\s+(?:de|desde)\s+(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:-|–|a|hasta)\s*(\d+(?:[.,]\d+)?)\s*mm/i,
  /juntas?\s+desde\s+(\d+(?:[.,]\d+)?)\s*mm.{0,30}?hasta\s+(\d+(?:[.,]\d+)?)\s*mm/i,
];

export function toNumber(token: string): number {
  return Number(token.replace(",", "."));
}

export function parseNumbers(text?: string | null): number[] {
  if (!text) return [];
  return (text.match(NUMBER) ?? []).map(toNumber).filter(Number.isFinite);
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Corona formats are written in centimeters ("60X60 cm"); returns millimeters. */
export function parseFormatMm(...candidates: (string | null | undefined)[]): FormatMm | null {
  for (const candidate of candidates) {
    const match = candidate?.match(FORMAT);
    if (match) {
      return {
        length: Math.round(toNumber(match[1]) * 10),
        width: Math.round(toNumber(match[2]) * 10),
      };
    }
  }
  return null;
}

/** Sheets give a tolerance range ("7,90 a 8,50 mm"); the upper bound is the safe value. */
export function parseThicknessMm(text?: string | null): number | null {
  const numbers = parseNumbers(text);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

export function parseCoverageKgM2(text?: string | null): Range | null {
  if (!text) return null;
  const range = text.match(KG_M2_RANGE);
  if (range) {
    const a = toNumber(range[1]);
    const b = toNumber(range[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = text.match(KG_M2_SINGLE);
  if (single) {
    const value = toNumber(single[1]);
    return { min: value, max: value };
  }
  return null;
}

export function parseKg(...candidates: (string | null | undefined)[]): number | null {
  for (const candidate of candidates) {
    const match = candidate?.match(KG);
    if (match) return toNumber(match[1]);
  }
  return null;
}

export function parseJointRangeMm(text: string): Range | null {
  const flat = text.replace(/\s+/g, " ");
  for (const pattern of JOINT_PATTERNS) {
    const match = flat.match(pattern);
    if (!match) continue;
    const min = toNumber(match[1]);
    const max = toNumber(match[2]);
    if (min > 0 && max >= min && max <= 50) return { min, max };
  }
  return null;
}
