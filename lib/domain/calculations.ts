import type { FormatMm } from "./types";

export const DEFAULT_WASTE_PCT = 0.1;
/** Typical density of cementitious grout. The result is labeled as an estimate. */
export const GROUT_DENSITY_G_CM3 = 1.6;

export interface AreaResult {
  areaM2: number;
  wastePct: number;
  areaWithWasteM2: number;
}

export interface BoxesResult {
  boxes: number;
  coveredM2: number;
}

export interface AdhesiveResult {
  kg: number;
  bags: number;
}

export interface GroutResult {
  consumptionKgM2: number;
  kg: number;
  units: number;
}

export function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function assertPositive(name: string, value: number): void {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

/** ceil() that ignores floating-point noise (5.4 / 1.8 = 3.0000000000000004). */
function ceilUnits(value: number): number {
  return Math.ceil(round(value, 9));
}

export function computeArea(lengthM: number, widthM: number, wastePct = DEFAULT_WASTE_PCT): AreaResult {
  assertPositive("lengthM", lengthM);
  assertPositive("widthM", widthM);
  if (!(Number.isFinite(wastePct) && wastePct >= 0 && wastePct <= 0.5)) {
    throw new RangeError(`wastePct must be between 0 and 0.5, got ${wastePct}`);
  }
  const area = lengthM * widthM;
  return {
    areaM2: round(area, 3),
    wastePct,
    areaWithWasteM2: round(area * (1 + wastePct), 3),
  };
}

export function computeBoxes(areaM2: number, m2PerBox: number): BoxesResult {
  assertPositive("areaM2", areaM2);
  assertPositive("m2PerBox", m2PerBox);
  const boxes = ceilUnits(areaM2 / m2PerBox);
  return { boxes, coveredM2: round(boxes * m2PerBox, 3) };
}

export function computeAdhesive(areaM2: number, coverageKgM2: number, bagKg: number): AdhesiveResult {
  assertPositive("areaM2", areaM2);
  assertPositive("coverageKgM2", coverageKgM2);
  assertPositive("bagKg", bagKg);
  const kg = areaM2 * coverageKgM2;
  return { kg: round(kg), bags: ceilUnits(kg / bagKg) };
}

/**
 * Standard joint-volume estimate:
 *   kg/m² = ((L + W) / (L × W)) × joint × depth × density
 * with L, W, joint and depth in mm and density in g/cm³.
 */
export function computeGrout(
  areaM2: number,
  tile: FormatMm,
  thicknessMm: number,
  jointMm: number,
  packageKg: number,
  densityGCm3 = GROUT_DENSITY_G_CM3,
): GroutResult {
  assertPositive("areaM2", areaM2);
  assertPositive("tile.length", tile.length);
  assertPositive("tile.width", tile.width);
  assertPositive("thicknessMm", thicknessMm);
  assertPositive("jointMm", jointMm);
  assertPositive("packageKg", packageKg);
  assertPositive("densityGCm3", densityGCm3);
  const consumption =
    ((tile.length + tile.width) / (tile.length * tile.width)) * jointMm * thicknessMm * densityGCm3;
  const kg = consumption * areaM2;
  return { consumptionKgM2: round(consumption, 3), kg: round(kg), units: ceilUnits(kg / packageKg) };
}
