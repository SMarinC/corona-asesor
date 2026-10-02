import { describe, expect, it } from "vitest";
import { computeMaterialsInput, createComputeMaterialsTool, executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { callTool } from "@/tests/helpers/call-tool";

const deps = makeToolDeps();
const room = { lengthM: 3, widthM: 2 };

describe("computeMaterials tool", () => {
  it("computes area with 10% waste and boxes from catalog data", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T1" });
    expect(result).toEqual({
      status: "ok",
      data: {
        area: { areaM2: 6, wastePct: 0.1, areaWithWasteM2: 6.6 },
        tile: { sku: "T1", name: "Piso Prueba Blanco 60x60", m2PerBox: 1.44, m2PerBoxSource: "catalog", citationId: null, boxes: 5, coveredM2: 7.2 },
        adhesive: null,
        grout: null,
        rejectedOverrides: [],
      },
    });
  });

  it("computes adhesive (upper coverage bound) and grout on the area without waste", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.adhesive).toMatchObject({ sku: "A1", coverageKgM2: 5, bagKg: 25, kg: 30, bags: 2, citationIds: [] });
    expect(result.data.grout).toMatchObject({ sku: "G1", jointWidthMm: 3, consumptionKgM2: 0.136, kg: 0.82, packageKg: 2, units: 1 });
  });

  it("flags a missing m² per box as needs_review", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T2" });
    expect(result.status).toBe("needs_review");
    if (result.status !== "needs_review") return;
    expect(result.missing.map((m) => m.field)).toEqual(["m2PerBox"]);
    expect(result.missing[0].reason).toContain("searchTechnicalSheets");
    expect(result.missing[0].reason).toContain("overrides.m2PerBox");
    expect(result.data.area).toEqual({ areaM2: 6, wastePct: 0.1, areaWithWasteM2: 6.6 });
    expect(result.data.tile).toBeUndefined();
  });

  it("tells the model to look up missing adhesive data in the technical sheets and cite it", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T1", adhesiveSku: "A2" });
    expect(result.status).toBe("needs_review");
    if (result.status !== "needs_review") return;
    expect(result.missing.map((m) => m.field)).toEqual(["adhesiveCoverageKgM2", "bagKg"]);
    for (const { field, reason } of result.missing) {
      expect(reason, field).toContain("PEGACOR® Flex Gris");
      expect(reason, field).toContain("searchTechnicalSheets");
      expect(reason, field).toContain(`overrides.${field}`);
      expect(reason, field).toContain("citationId");
    }
  });

  it("accepts a cited value that the sheet really states for that product", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T2", overrides: { m2PerBox: { value: 1.62, citationId: "c0003" } } });
    expect(result).toMatchObject({
      status: "ok",
      data: { tile: { m2PerBox: 1.62, m2PerBoxSource: "citation", citationId: "c0003", boxes: 5, coveredM2: 8.1 } },
    });
  });

  it("rejects a cited value that is not in the fragment", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T2", overrides: { m2PerBox: { value: 1.8, citationId: "c0003" } } });
    expect(result).toMatchObject({ status: "needs_review", data: { rejectedOverrides: [{ field: "m2PerBox", citationId: "c0003", reason: "value_not_in_citation" }] } });
  });

  it("rejects a citation that belongs to another product", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T2", overrides: { m2PerBox: { value: 1.62, citationId: "c0001" } } });
    expect(result).toMatchObject({ status: "needs_review", data: { rejectedOverrides: [{ reason: "citation_other_product" }] } });
  });

  it("fills adhesive coverage and bag size from verified citations", () => {
    const result = executeComputeMaterials(deps, {
      ...room,
      tileSku: "T1",
      adhesiveSku: "A2",
      overrides: { adhesiveCoverageKgM2: { value: 6, citationId: "c0004" }, bagKg: { value: 25, citationId: "c0004" } },
    });
    expect(result).toMatchObject({ status: "ok", data: { adhesive: { coverageKgM2: 6, bagKg: 25, kg: 36, bags: 2, citationIds: ["c0004"] } } });
  });

  it("rejects the lower bound of a cited coverage range instead of underestimating", () => {
    const result = executeComputeMaterials(deps, {
      ...room,
      tileSku: "T1",
      adhesiveSku: "A2",
      overrides: { adhesiveCoverageKgM2: { value: 5, citationId: "c0004" }, bagKg: { value: 25, citationId: "c0004" } },
    });
    expect(result).toMatchObject({
      status: "needs_review",
      missing: [{ field: "adhesiveCoverageKgM2" }],
      data: { rejectedOverrides: [{ field: "adhesiveCoverageKgM2", citationId: "c0004", reason: "value_not_in_citation" }] },
    });
    if (result.status === "needs_review") expect(result.data.adhesive).toBeUndefined();
  });

  it("keeps the catalog value when an override disagrees with it", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T1", overrides: { m2PerBox: { value: 2, citationId: "c0003" } } });
    expect(result).toMatchObject({
      status: "ok",
      data: { tile: { m2PerBox: 1.44, m2PerBoxSource: "catalog" }, rejectedOverrides: [{ reason: "catalog_has_value" }] },
    });
  });

  it("asks for the joint width and other grout inputs instead of assuming them", () => {
    const noJoint = executeComputeMaterials(deps, { ...room, tileSku: "T1", groutSku: "G1" });
    expect(noJoint).toMatchObject({ status: "needs_review", missing: [{ field: "jointWidthMm" }], data: { tile: { boxes: 5 } } });
    const noThickness = executeComputeMaterials(deps, { ...room, tileSku: "T4", groutSku: "G1", jointWidthMm: 3 });
    expect(noThickness).toMatchObject({ status: "needs_review", missing: [{ field: "thicknessMm" }] });
    if (noThickness.status === "needs_review") expect(noThickness.missing[0].reason).toContain("sin el espesor no se puede calcular la boquilla");
  });

  it("returns lookup problems as data", () => {
    expect(executeComputeMaterials(deps, { ...room, tileSku: "A1" })).toMatchObject({ status: "error", code: "wrong_kind" });
    expect(executeComputeMaterials(deps, { ...room, tileSku: "T1", adhesiveSku: "ZZ9" })).toMatchObject({ status: "error", code: "unknown_sku" });
    expect(executeComputeMaterials(deps, { ...room, tileSku: "T1", groutSku: "G2", jointWidthMm: 3 })).toMatchObject({ status: "error", code: "invalid_input" });
  });

  it("never throws, even on input that bypassed the schema", async () => {
    const result = await callTool(createComputeMaterialsTool(deps), { lengthM: 0, widthM: 2, tileSku: "T1" });
    expect(result).toMatchObject({ status: "error", code: "invalid_input" });
  });

  it("validates dimensions and waste in the schema", () => {
    expect(computeMaterialsInput.safeParse({ lengthM: -3, widthM: 2, tileSku: "T1" }).success).toBe(false);
    expect(computeMaterialsInput.safeParse({ lengthM: 3, widthM: 2, tileSku: "T1", wastePct: 0.6 }).success).toBe(false);
  });
});
