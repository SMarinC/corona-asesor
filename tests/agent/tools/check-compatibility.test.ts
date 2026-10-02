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

  it("takes the worst verdict across tile and adhesive, keeping the deciding check's message and citation", () => {
    // A1 excludes porcelain, and T3 is porcelain.
    const result = executeCheckCompatibility(deps, { surface: "floor", environment: "outdoor", wetArea: true, traffic: "high", tileSku: "T3", adhesiveSku: "A1" });
    expect(result).toMatchObject({ status: "ok", data: { verdict: "incompatible", products: { adhesive: { sku: "A1" }, grout: null } } });
    if (result.status !== "ok") return;
    expect(result.data.checks).toContainEqual({
      rule: "Pegante ↔ material",
      verdict: "incompatible",
      message: "La ficha del pegante excluye gres porcelánico.",
      citationId: "c0001",
    });
  });

  it("lists the citations of its checks once, at the top level", () => {
    const result = executeCheckCompatibility(deps, { ...bathroom, environment: "outdoor", tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // A1's material and outdoor checks both cite c0001; G1's joint check cites c0002.
    expect(result.data.checks.filter((c) => c.citationId === "c0001")).toHaveLength(2);
    expect(result.data.citationIds).toEqual(["c0001", "c0002"]);
    expect(result.data.checks).toContainEqual(expect.objectContaining({ rule: "Boquilla ↔ junta", message: "Junta de 3 mm dentro del rango 1–5 mm de la ficha.", citationId: "c0002" }));
  });

  it("returns an empty citation list when no check is cited", () => {
    const result = executeCheckCompatibility(deps, { ...bathroom, tileSku: "T1" });
    expect(result).toMatchObject({ status: "ok", data: { citationIds: [] } });
  });

  it("does not report a traffic level the user never gave for a wall", () => {
    const wall = executeCheckCompatibility(deps, { surface: "wall", environment: "indoor", wetArea: true, tileSku: "T2" });
    expect(wall).toMatchObject({ status: "ok", data: { project: { surface: "wall", traffic: null } } });
    const floor = executeCheckCompatibility(deps, { ...bathroom, tileSku: "T1" });
    expect(floor).toMatchObject({ status: "ok", data: { project: { traffic: "medium" } } });
  });
});
