import type { ProjectState } from "./derive-project";

/**
 * True when anything in the project needs a person's review. `quote.needsReview` stays false for a stale quote, so
 * the review list (which carries the stale item) is the source of truth, with the quote flags as a second guard.
 */
export function needsReview(project: ProjectState): boolean {
  return project.review.length > 0 || project.quote?.stale === true || project.quote?.needsReview === true;
}

export interface TileRef {
  sku: string;
  name: string;
}

/**
 * `project.tile` follows the last tile any tool touched, so the materials and the compatibility verdict can refer
 * to different tiles. Returns both when they differ, so neither is shown as if it described the other.
 */
export function tileMismatch(project: ProjectState): { materials: TileRef; checked: TileRef } | null {
  const materials = project.materials?.tile;
  const checked = project.compatibility?.products.tile;
  if (!materials || !checked || materials.sku === checked.sku) return null;
  return { materials: { sku: materials.sku, name: materials.name }, checked: { sku: checked.sku, name: checked.name } };
}

/** Helvetica's WinAnsi encoding has no "↔" (rule names such as "Pegante ↔ material") nor "≥"/"≤". */
export const pdfText = (text: string): string => text.replaceAll("↔", "y").replaceAll("≥", ">=").replaceAll("≤", "<=");
