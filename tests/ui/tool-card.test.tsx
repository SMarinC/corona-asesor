// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CitationsProvider } from "@/components/chat/citations-context";
import { ToolCard } from "@/components/tools/tool-card";
import { executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { deriveProject } from "@/lib/ui/derive-project";
import { type CoronaToolPart, isToolPart, toolNameOf } from "@/lib/ui/tool-parts";
import { makeToolDeps } from "../fixtures/tool-deps";
import { bathroomConversation, errorPart, toolPart } from "../fixtures/ui-messages";

afterEach(cleanup);

const conversation = bathroomConversation();
const parts = conversation[1].parts.filter(isToolPart);
const find = (name: string, n = 0) => parts.filter((p) => toolNameOf(p) === name)[n];

function show(part: CoronaToolPart, citations = deriveProject(conversation).citations) {
  return render(
    <CitationsProvider ids={citations}>
      <ul>
        <ToolCard part={part} />
      </ul>
    </CitationsProvider>,
  );
}

describe("ToolCard", () => {
  it("shows a running step with no result yet", () => {
    show(toolPart("searchTiles", { surface: "floor" }));
    expect(screen.getByText("Buscando revestimientos")).toBeTruthy();
    expect(screen.getByRole("listitem").dataset.phase).toBe("running");
  });

  it("lists tiles with price per box and format", () => {
    show(find("searchTiles"));
    expect(screen.getByText("Revestimientos encontrados")).toBeTruthy();
    expect(screen.getByText("Piso Prueba Blanco 60x60")).toBeTruthy();
    expect(screen.getAllByText("$80.000").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/por caja/).length).toBeGreaterThan(0);
  });

  it("shows supplies with the citation that backs their compatibility", () => {
    show(find("searchSupplies"));
    expect(screen.getByText("Pegantes encontrados")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver la cita c0001 de la ficha técnica" })).toBeTruthy();
  });

  it("flags a citation that no tool returned", () => {
    show(find("searchSupplies"), []);
    expect(screen.getByRole("button", { name: "La cita c0001 no viene de ninguna herramienta" })).toBeTruthy();
  });

  it("shows computed quantities in boxes, bags and units", () => {
    show(find("computeMaterials"));
    expect(screen.getByText("5 cajas")).toBeTruthy();
    expect(screen.getByText("2 bultos")).toBeTruthy();
    expect(screen.getByText("1 unidad")).toBeTruthy();
  });

  it("explains what is missing instead of showing a number", () => {
    const input = { lengthM: 2, widthM: 2, tileSku: "T4", groutSku: "G1", jointWidthMm: 2 };
    show(toolPart("computeMaterials", input, executeComputeMaterials(makeToolDeps(), input)));
    expect(screen.getByText("Materiales calculados, con datos por revisar")).toBeTruthy();
    expect(screen.getByText("Requiere revisión")).toBeTruthy();
    expect(screen.getByText(/sin el espesor no se puede calcular la boquilla/)).toBeTruthy();
    expect(screen.queryByText(/unidad/)).toBeNull();
  });

  it("shows the compatibility verdict", () => {
    show(find("checkCompatibility"));
    expect(screen.getByText("Compatible")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver las \d+ reglas/ })).toBeTruthy();
  });

  it("summarizes the quote against the budget", () => {
    show(find("buildQuote"));
    expect(screen.getByText("$490.500")).toBeTruthy();
    expect(screen.getByText(/dentro del presupuesto \(quedan \$1\.009\.500\)/)).toBeTruthy();
  });

  it("explains failures in Spanish, including SDK rejections", () => {
    show(toolPart("buildQuote", {}, { status: "error", code: "unknown_sku", message: "SKU que no existen en el catálogo: ZZ9." }));
    expect(screen.getByText("SKU que no existen en el catálogo: ZZ9.")).toBeTruthy();
    cleanup();
    show(errorPart("computeMaterials", {}, "Invalid input for tool computeMaterials: Type validation failed"));
    expect(screen.getByText("La herramienta rechazó los datos; el asesor puede corregir la llamada.")).toBeTruthy();
  });
});
