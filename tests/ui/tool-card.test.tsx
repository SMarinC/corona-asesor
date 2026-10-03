// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MaterialsSummary } from "@/components/tools/analysis-results";
import { TileResults } from "@/components/tools/product-results";
import { VerdictBadge, VerdictDot } from "@/components/tools/verdict-badge";
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
    expect(screen.getByRole("button", { name: "Cita c0001 no verificada: ninguna herramienta la devolvió" })).toBeTruthy();
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
    expect(screen.getByText("La herramienta no pudo completar la consulta.")).toBeTruthy();
  });

  it("does not show a green check when the verdict needs review or is incompatible", () => {
    const part = find("checkCompatibility") as unknown as { output: { data: object } };
    for (const [verdict, label, phase] of [
      ["needs_review", "Compatibilidad: requiere revisión", "review"],
      ["incompatible", "Compatibilidad: incompatible", "error"],
    ] as const) {
      const output = { ...part.output, data: { ...part.output.data, verdict } };
      show({ ...part, output } as unknown as CoronaToolPart);
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByText("Compatibilidad verificada")).toBeNull();
      expect(screen.getByRole("listitem").dataset.phase).toBe(phase);
      cleanup();
    }
  });

  it("labels an errored call and does not claim the data was rejected", () => {
    show(errorPart("searchTiles", {}, "boom"));
    expect(screen.getByText("Buscando revestimientos: no se pudo completar")).toBeTruthy();
    expect(screen.getByRole("listitem").dataset.phase).toBe("error");
    expect(screen.queryByText(/rechazó/)).toBeNull();
  });
});

describe("result bodies", () => {
  const tiles = () => {
    const result = (find("searchTiles") as unknown as { output: { data: { results: Parameters<typeof TileResults>[0]["results"] } } }).output.data.results;
    return Array.from({ length: 5 }, (_, i) => ({ ...result[0], sku: `X${i}`, name: `Baldosa ${i}`, imageUrl: "https://corona.co/medias/x.jpg" }));
  };

  it("shows three results and toggles the rest with aria-expanded", () => {
    render(<TileResults results={tiles()} />);
    expect(screen.getAllByText(/Baldosa/)).toHaveLength(3);
    const toggle = screen.getByRole("button", { name: "Ver 2 más" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getAllByText(/Baldosa/)).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Ver menos" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("marks unknown attributes as needing review and keeps thumbnails decorative", () => {
    const [tile] = tiles();
    const { container } = render(<TileResults results={[{ ...tile, unknown: ["wetArea", "traffic"] }]} />);
    expect(screen.getByText(/Sin dato en el catálogo: zona húmeda, tráfico\. Requiere revisión\./)).toBeTruthy();
    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) expect(img.getAttribute("alt")).toBe("");
  });

  it("renders each verdict with its own label, never swapping review for a verdict", () => {
    render(
      <div>
        <VerdictBadge verdict="incompatible" />
        <VerdictBadge verdict="needs_review" />
        <VerdictDot verdict="needs_review" />
      </div>,
    );
    expect(screen.getByText("Incompatible")).toBeTruthy();
    expect(screen.getAllByText("Requiere revisión")).toHaveLength(1);
    expect(screen.queryByText("Compatible")).toBeNull();
    expect(screen.getByRole("img", { name: "Requiere revisión" })).toBeTruthy();
  });

  it("shows a citation chip next to values taken from a technical sheet", () => {
    const output = (find("computeMaterials") as unknown as { output: { data: Parameters<typeof MaterialsSummary>[0]["data"] } }).output.data;
    const data = {
      ...output,
      tile: { ...output.tile!, citationId: "c0001" },
      adhesive: { ...output.adhesive!, citationIds: ["c0002"] },
    };
    render(
      <CitationsProvider ids={["c0001"]}>
        <MaterialsSummary data={data} />
      </CitationsProvider>,
    );
    expect(screen.getByRole("button", { name: "Ver la cita c0001 de la ficha técnica" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cita c0002 no verificada: ninguna herramienta la devolvió" })).toBeTruthy();
  });
});
