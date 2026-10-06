import { normalizeText } from "./parse";
import type { Adhesive, Environment, Grout, Surface, Tile, TileMaterial } from "./types";

export interface Ranked<T> {
  product: T;
  score: number;
  /** Requested attributes the catalog does not state for this product. */
  unknown: string[];
}

export interface TileFilters {
  surface?: Surface;
  environment?: Environment;
  wetArea?: boolean;
  finish?: string;
  design?: string;
  color?: string;
  maxPrice?: number;
}

export interface AdhesiveFilters {
  tileMaterial?: TileMaterial;
  outdoor?: boolean;
}

export interface GroutFilters {
  jointWidthMm?: number;
  color?: string;
}

const priceKey = (price: number | null) => price ?? Number.MAX_SAFE_INTEGER;

function byRank<T extends { price: number | null }>(a: Ranked<T>, b: Ranked<T>): number {
  return b.score - a.score || a.unknown.length - b.unknown.length || priceKey(a.product.price) - priceKey(b.product.price);
}

const includesText = (haystack: string, needle: string) => normalizeText(haystack).includes(normalizeText(needle));

export function searchTiles(tiles: Tile[], filters: TileFilters, limit = 6): Ranked<Tile>[] {
  const ranked: Ranked<Tile>[] = [];
  for (const tile of tiles) {
    if (!tile.inStock) continue;
    if (filters.surface && tile.surface !== filters.surface) continue;
    if (filters.maxPrice !== undefined && (tile.price === null || tile.price > filters.maxPrice)) continue;
    if (filters.color && !includesText(tile.name, filters.color)) continue;

    let score = 0;
    const unknown: string[] = [];
    if (filters.environment) {
      const value = filters.environment === "outdoor" ? tile.outdoor : tile.indoor;
      if (value === false) continue;
      if (value === null) unknown.push(filters.environment);
      else score += 1;
    }
    if (filters.wetArea) {
      if (tile.wetArea === false) continue;
      if (tile.wetArea === null) unknown.push("wetArea");
      else score += 1;
    }
    if (filters.finish) {
      if (tile.finish === null) unknown.push("finish");
      else if (normalizeText(tile.finish) !== normalizeText(filters.finish)) continue;
      else score += 1;
    }
    if (filters.design) {
      if (tile.design === null) unknown.push("design");
      else if (!includesText(tile.design, filters.design)) continue;
      else score += 1;
    }
    ranked.push({ product: tile, score, unknown });
  }
  return ranked.sort(byRank).slice(0, limit);
}

export function searchAdhesives(adhesives: Adhesive[], filters: AdhesiveFilters, limit = 5): Ranked<Adhesive>[] {
  const ranked: Ranked<Adhesive>[] = [];
  for (const adhesive of adhesives) {
    if (!adhesive.inStock) continue;
    let score = 0;
    const unknown: string[] = [];
    if (filters.tileMaterial) {
      if (adhesive.excludedMaterials.includes(filters.tileMaterial)) continue;
      if (adhesive.compatibleMaterials?.includes(filters.tileMaterial)) score += 1;
      else unknown.push("tileMaterial");
    }
    if (filters.outdoor) {
      if (adhesive.outdoor === false) continue;
      if (adhesive.outdoor === null) unknown.push("outdoor");
      else score += 1;
    }
    ranked.push({ product: adhesive, score, unknown });
  }
  return ranked.sort(byRank).slice(0, limit);
}

export function searchGrouts(grouts: Grout[], filters: GroutFilters, limit = 5): Ranked<Grout>[] {
  const ranked: Ranked<Grout>[] = [];
  for (const grout of grouts) {
    if (!grout.inStock || grout.groutType === "repair") continue;
    if (filters.color && !includesText(grout.name, filters.color)) continue;
    let score = 0;
    const unknown: string[] = [];
    if (filters.jointWidthMm !== undefined) {
      if (grout.jointMm === null) unknown.push("jointWidthMm");
      else if (filters.jointWidthMm < grout.jointMm.min || filters.jointWidthMm > grout.jointMm.max) continue;
      else score += 1;
    }
    ranked.push({ product: grout, score, unknown });
  }
  return ranked.sort(byRank).slice(0, limit);
}
