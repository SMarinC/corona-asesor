import { describe, expect, it } from "vitest";
import { executeCheckCompatibility } from "@/lib/agent/tools/check-compatibility";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

const deps = makeToolDeps();
const bathroom = { surface: "floor", environment: "indoor", wetArea: true, traffic: "medium" } as const;

describe("checkCompatibility tool", () => {
  it("approves a matching tile, adhesive and grout", () => {
    const result = executeCheckCompatibility(deps, { ...bathroom, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 });
    expect(result).toMatchObject({
      status: "ok",
      data: { verdict: "compatible", verdictLabel: "Compatible", products: { tile: { sku: "T1" }, adhesive: { sku: "A1" }, grout: { sku: "G1" } } },
    });
  });

  it("rejects a wall tile on a floor", () => {
    expect(executeCheckCompatibility(deps, { ...bathroom, tileSku: "T2" })).toMatchObject({ data: { verdict: "incompatible", verdictLabel: "Incompatible" } });
  });

  it("reports unknown data as Requiere revisión, never as incompatible", () => {
    const result = executeCheckCompatibility(deps, { ...bathroom, tileSku: "T4" });
    expect(result).toMatchObject({ status: "ok", data: { verdict: "needs_review", verdictLabel: "Requiere revisión" } });
  });

  it("requires traffic for floors but not for walls", () => {
    const floorWithoutTraffic = { surface: "floor", environment: "indoor", wetArea: true } as const;
    expect(executeCheckCompatibility(deps, { ...floorWithoutTraffic, tileSku: "T1" })).toMatchObject({ status: "error", code: "invalid_input" });
    expect(executeCheckCompatibility(deps, { surface: "wall", environment: "indoor", wetArea: true, tileSku: "T2" })).toMatchObject({
      status: "ok",
      data: { verdict: "compatible" },
    });
  });

  it("returns lookup problems as data, without a verdict", () => {
    const unknown = executeCheckCompatibility(deps, { ...bathroom, tileSku: "ZZ9" });
    expect(unknown).toMatchObject({ status: "error", code: "unknown_sku" });
    expect(unknown).not.toHaveProperty("data");
    const wrongKind = executeCheckCompatibility(deps, { ...bathroom, tileSku: "T1", adhesiveSku: "G1" });
    expect(wrongKind).toMatchObject({ status: "error", code: "wrong_kind" });
    expect(wrongKind).not.toHaveProperty("data");
  });

  it("does not let a rejected adhesive or grout lookup produce a verdict", () => {
    expect(executeCheckCompatibility(deps, { ...bathroom, tileSku: "T1", groutSku: "A1" })).toMatchObject({ status: "error", code: "wrong_kind" });
    expect(executeCheckCompatibility(deps, { ...bathroom, tileSku: "T1", groutSku: "ZZ9" })).toMatchObject({ status: "error", code: "unknown_sku" });
  });

  it("takes the worst verdict across tile, adhesive and grout", () => {
    // A1 excludes porcelain, and T3 is porcelain.
    const result = executeCheckCompatibility(deps, { surface: "floor", environment: "outdoor", wetArea: true, traffic: "high", tileSku: "T3", adhesiveSku: "A1" });
    expect(result).toMatchObject({ status: "ok", data: { verdict: "incompatible", products: { adhesive: { sku: "A1" }, grout: null } } });
  });
});
