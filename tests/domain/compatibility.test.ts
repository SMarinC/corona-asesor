import { describe, expect, it } from "vitest";
import { evaluateCompatibility, type ProjectConditions, worstVerdict } from "@/lib/domain/compatibility";
import { makeAdhesive, makeGrout, makeTile } from "@/tests/fixtures/products";

const bathroom: ProjectConditions = { environment: "indoor", surface: "floor", wetArea: true, traffic: "medium", jointWidthMm: 3 };

function verdictOf(rule: string, result: ReturnType<typeof evaluateCompatibility>) {
  return result.checks.find((c) => c.rule === rule)?.verdict;
}

describe("worstVerdict", () => {
  it("orders incompatible > needs_review > compatible", () => {
    expect(worstVerdict(["compatible", "needs_review"])).toBe("needs_review");
    expect(worstVerdict(["needs_review", "incompatible", "compatible"])).toBe("incompatible");
    expect(worstVerdict([])).toBe("compatible");
  });
});

describe("evaluateCompatibility", () => {
  it("accepts a fully documented bathroom combination", () => {
    const result = evaluateCompatibility(makeTile(), bathroom, makeAdhesive(), makeGrout());
    expect(result.verdict).toBe("compatible");
    expect(result.checks).toHaveLength(9);
  });

  it("rejects an indoor-only tile outdoors", () => {
    const result = evaluateCompatibility(makeTile(), { ...bathroom, environment: "outdoor" });
    expect(verdictOf("Ambiente", result)).toBe("incompatible");
  });

  it("asks for review instead of rejecting when usage areas are unknown", () => {
    const tile = makeTile({ indoor: null, outdoor: null, wetArea: null });
    const result = evaluateCompatibility(tile, bathroom);
    expect(verdictOf("Ambiente", result)).toBe("needs_review");
    expect(verdictOf("Humedad", result)).toBe("needs_review");
    expect(result.verdict).toBe("needs_review");
  });

  it("rejects a tile not listed for wet areas in a wet project", () => {
    const result = evaluateCompatibility(makeTile({ wetArea: false }), bathroom);
    expect(verdictOf("Humedad", result)).toBe("incompatible");
  });

  it("skips the traffic rule for wall projects", () => {
    const wall = makeTile({ surface: "wall", traffic: null, trafficLabel: "Paredes" });
    const result = evaluateCompatibility(wall, { ...bathroom, surface: "wall", traffic: "high" });
    expect(verdictOf("Tráfico", result)).toBe("compatible");
  });

  it("rejects a wall tile on a floor project", () => {
    const wall = makeTile({ surface: "wall" });
    expect(verdictOf("Superficie", evaluateCompatibility(wall, bathroom))).toBe("incompatible");
  });

  it("asks for review when a floor tile goes on a wall", () => {
    const result = evaluateCompatibility(makeTile(), { ...bathroom, surface: "wall" });
    expect(verdictOf("Superficie", result)).toBe("needs_review");
  });

  it("accepts a floor-and-wall tile on a wall project", () => {
    const tile = makeTile({ name: "Piso Pared Prueba" });
    expect(verdictOf("Superficie", evaluateCompatibility(tile, { ...bathroom, surface: "wall" }))).toBe("compatible");
  });

  it("asks for review when a floor tile declares no traffic", () => {
    const tile = makeTile({ traffic: null, trafficLabel: null });
    expect(verdictOf("Tráfico", evaluateCompatibility(tile, bathroom))).toBe("needs_review");
  });

  it("rejects residential traffic for a high-traffic project", () => {
    const result = evaluateCompatibility(makeTile(), { ...bathroom, traffic: "high" });
    expect(verdictOf("Tráfico", result)).toBe("incompatible");
  });

  it("rejects an adhesive whose sheet excludes the tile material", () => {
    const porcelainTile = makeTile({ materials: ["porcelain"] });
    const result = evaluateCompatibility(porcelainTile, bathroom, makeAdhesive());
    expect(verdictOf("Pegante ↔ material", result)).toBe("incompatible");
  });

  it("asks for review when the adhesive sheet does not mention the material", () => {
    const stoneware = makeTile({ materials: ["stoneware"] });
    const result = evaluateCompatibility(stoneware, bathroom, makeAdhesive());
    expect(verdictOf("Pegante ↔ material", result)).toBe("needs_review");
  });

  it("carries the sheet citation on adhesive and grout checks", () => {
    const result = evaluateCompatibility(makeTile(), bathroom, makeAdhesive(), makeGrout());
    expect(result.checks.find((c) => c.rule === "Pegante ↔ material")?.citationId).toBe("c0001");
    expect(result.checks.find((c) => c.rule === "Boquilla ↔ junta")?.citationId).toBe("c0002");
  });

  it("rejects an interior-only adhesive outdoors", () => {
    const outdoorTile = makeTile({ outdoor: true });
    const result = evaluateCompatibility(
      outdoorTile,
      { ...bathroom, environment: "outdoor" },
      makeAdhesive({ outdoor: false }),
    );
    expect(verdictOf("Pegante ↔ ambiente", result)).toBe("incompatible");
  });

  it("requires a declared joint width for grout", () => {
    const noJoint: ProjectConditions = { environment: "indoor", surface: "floor", wetArea: true, traffic: "medium" };
    const result = evaluateCompatibility(makeTile(), noJoint, undefined, makeGrout());
    expect(verdictOf("Boquilla ↔ junta", result)).toBe("needs_review");
  });

  it("rejects a joint outside the grout range", () => {
    const result = evaluateCompatibility(makeTile(), { ...bathroom, jointWidthMm: 8 }, undefined, makeGrout());
    expect(verdictOf("Boquilla ↔ junta", result)).toBe("incompatible");
  });

  it("never offers a repair product as grout", () => {
    const result = evaluateCompatibility(makeTile(), bathroom, undefined, makeGrout({ groutType: "repair" }));
    expect(verdictOf("Boquilla ↔ junta", result)).toBe("incompatible");
  });

  it("rejects out-of-stock products", () => {
    const result = evaluateCompatibility(makeTile({ inStock: false }), bathroom);
    expect(verdictOf("Disponibilidad (revestimiento)", result)).toBe("incompatible");
  });
});
