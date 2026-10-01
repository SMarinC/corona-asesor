import { describe, expect, it } from "vitest";
import { DESIGN_LABELS, FINISH_LABELS } from "@/lib/agent/tools/labels";
import { executeSearchTiles, searchTilesInput } from "@/lib/agent/tools/search-tiles";
import { getCatalog } from "@/lib/data/catalog";
import { normalizeText } from "@/lib/domain/parse";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const deps = makeToolDeps();

function okData(result: ReturnType<typeof executeSearchTiles>) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result.data;
}

describe("searchTiles tool", () => {
  it("ranks by filter fit and reports price per box and per m²", () => {
    const data = okData(executeSearchTiles(deps, { surface: "floor", environment: "indoor", wetArea: true }));
    expect(data.results.map((r) => r.sku)).toEqual(["T1", "T4"]);
    expect(data.results[0]).toMatchObject({ price: 80000, priceUnit: "caja", m2PerBox: 1.44, pricePerM2: 55556, imageUrl: "https://corona.co/medias/T1.jpg" });
    expect(data.results[1].unknown).toEqual(["indoor", "wetArea"]);
  });

  it("maps a canonical design label onto the catalog's inconsistent labels", () => {
    const data = okData(executeSearchTiles(deps, { design: "neutro" }));
    expect(data.results.map((r) => r.sku)).toEqual(["T2", "T4"]);
    expect(data.results[1].unknown).toContain("design");
  });

  it("filters by maximum price per box", () => {
    const data = okData(executeSearchTiles(deps, { maxPricePerBox: 50000 }));
    expect(data.results.map((r) => r.sku)).toEqual(["T2"]);
  });

  it("explains an empty result", () => {
    const data = okData(executeSearchTiles(deps, { surface: "wall", design: "madera" }));
    expect(data.results).toEqual([]);
    expect(data.note).toMatch(/Sin resultados/);
  });

  it("rejects free-text designs and non-positive prices", () => {
    expect(searchTilesInput.safeParse({ design: "Marmolizado" }).success).toBe(false);
    expect(searchTilesInput.safeParse({ maxPricePerBox: 0 }).success).toBe(false);
    expect(searchTilesInput.safeParse({ limit: 11 }).success).toBe(false);
  });

  it("covers every design and finish label in the real catalog", () => {
    const tiles = getCatalog().tiles;
    const designs = [...new Set(tiles.map((t) => t.design).filter((d): d is string => d !== null))];
    const needles = Object.values(DESIGN_LABELS);
    expect(designs.filter((d) => !needles.some((n) => normalizeText(d).includes(n)))).toEqual([]);
    const finishes = [...new Set(tiles.map((t) => t.finish).filter((f): f is string => f !== null))];
    expect(finishes.filter((f) => !(FINISH_LABELS as readonly string[]).includes(f))).toEqual([]);
  });
});
