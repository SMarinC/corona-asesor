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
        tile: { sku: "T1", name: "Piso Prueba Blanco 60x60", m2PerBox: 1.44, boxes: 5, coveredM2: 7.2 },
        adhesive: null,
        grout: null,
      },
    });
  });

  it("computes adhesive (upper coverage bound) and grout on the area without waste", () => {
    const result = executeComputeMaterials(deps, { ...room, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.adhesive).toMatchObject({ sku: "A1", coverageKgM2: 5, bagKg: 25, kg: 30, bags: 2 });
    expect(result.data.grout).toMatchObject({ sku: "G1", jointWidthMm: 3, consumptionKgM2: 0.136, kg: 0.82, packageKg: 2, units: 1 });
  });

  it("takes data values only from the catalog: the model cannot pass its own", () => {
    expect(Object.keys(computeMaterialsInput.shape)).not.toContain("overrides");
    const sneaked = { ...room, tileSku: "T1", overrides: { m2PerBox: { value: 2, citationId: "c0003" } } };
    const result = executeComputeMaterials(deps, computeMaterialsInput.parse(sneaked));
    expect(result).toMatchObject({ status: "ok", data: { tile: { m2PerBox: 1.44, boxes: 5 } } });
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
