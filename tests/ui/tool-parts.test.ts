import { describe, expect, it } from "vitest";
import { isToolPart, toolFailed, toolLabel, toolNameOf, toolPhase, toolResult } from "@/lib/ui/tool-parts";
import { errorPart, toolPart } from "../fixtures/ui-messages";

describe("tool parts", () => {
  it("recognizes tool parts and their names", () => {
    const part = toolPart("searchTiles", { surface: "floor" });
    expect(isToolPart(part)).toBe(true);
    expect(isToolPart({ type: "text", text: "hola" })).toBe(false);
    expect(toolNameOf(part)).toBe("searchTiles");
  });

  it("derives the phase from the SDK state and our ToolResult status", () => {
    expect(toolPhase(toolPart("computeMaterials", {}))).toBe("running");
    expect(toolPhase(toolPart("computeMaterials", {}, { status: "ok", data: {} }))).toBe("done");
    expect(toolPhase(toolPart("computeMaterials", {}, { status: "needs_review", data: {}, missing: [] }))).toBe("review");
    expect(toolPhase(toolPart("computeMaterials", {}, { status: "error", code: "unknown_sku", message: "x" }))).toBe("error");
    expect(toolPhase(errorPart("computeMaterials", {}, "Invalid input"))).toBe("error");
  });

  it("returns the output only once it is available", () => {
    const running = toolPart("buildQuote", { lines: [] });
    expect(toolResult(running as never)).toBeNull();
    const done = toolPart("buildQuote", { lines: [] }, { status: "ok", data: { total: 1 } });
    expect(toolResult(done as never)).toEqual({ status: "ok", data: { total: 1 } });
  });

  it("labels steps in Spanish, naming adhesive or grout searches", () => {
    expect(toolLabel(toolPart("searchTiles", {}))).toBe("Buscando revestimientos");
    expect(toolLabel(toolPart("searchSupplies", { kind: "grout" }))).toBe("Buscando boquillas");
    expect(toolLabel(toolPart("searchSupplies", { kind: "adhesive" }, { status: "ok", data: {} }))).toBe("Pegantes encontrados");
    expect(toolLabel(toolPart("computeMaterials", {}, { status: "needs_review", data: {}, missing: [] }))).toBe(
      "Materiales calculados, con datos por revisar",
    );
    expect(toolLabel(errorPart("buildQuote", {}, "x"))).toBe("Armando la cotización: no se pudo completar");
  });
});

describe("compatibility verdict in the shared phase and label", () => {
  const compat = (verdict: string) =>
    toolPart("checkCompatibility", {}, { status: "ok", data: { verdict, checks: [] } });

  it("maps a finished check to done, review or error by its verdict", () => {
    expect(toolPhase(compat("compatible"))).toBe("done");
    expect(toolLabel(compat("compatible"))).toBe("Compatibilidad verificada");
    expect(toolPhase(compat("needs_review"))).toBe("review");
    expect(toolLabel(compat("needs_review"))).toBe("Compatibilidad: requiere revisión");
    expect(toolPhase(compat("incompatible"))).toBe("error");
    expect(toolLabel(compat("incompatible"))).toBe("Compatibilidad: incompatible");
  });

  it("tells a failed call apart from an incompatible verdict", () => {
    expect(toolFailed(compat("incompatible"))).toBe(false);
    expect(toolFailed(errorPart("checkCompatibility", {}, "x"))).toBe(true);
    expect(toolFailed(toolPart("buildQuote", {}, { status: "error", code: "x", message: "y" }))).toBe(true);
  });
});
