import { describe, expect, it } from "vitest";
import { isToolPart, toolLabel, toolNameOf, toolPhase, toolResult } from "@/lib/ui/tool-parts";
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
