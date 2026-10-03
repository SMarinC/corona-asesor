// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CitationsProvider } from "@/components/chat/citations-context";
import { MobileProjectBar } from "@/components/project/mobile-project-bar";
import { ProjectPanel } from "@/components/project/project-panel";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { deriveProject } from "@/lib/ui/derive-project";
import { bathroomConversation, userMessage } from "../fixtures/ui-messages";
import { laterRecalculation, withCheckedTile, withVerdict } from "../fixtures/project-variants";

afterEach(cleanup);

function show(messages: CoronaUIMessage[]) {
  const project = deriveProject(messages);
  return render(
    <CitationsProvider ids={project.citations}>
      <ProjectPanel project={project} messages={messages} timings={{}} />
    </CitationsProvider>,
  );
}

const reviewSection = () => screen.getByRole("heading", { level: 3, name: "Requiere revisión" }).closest("section") as HTMLElement;

describe("ProjectPanel", () => {
  it("teaches each section before the agent works", () => {
    show([userMessage("Hola")]);
    expect(screen.getByText("Aparece cuando el asesor calcule el área.")).toBeTruthy();
    expect(screen.getByText("La cotización usa solo precios del catálogo.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Descargar cotización en PDF" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Espacio",
      "Revestimiento",
      "Materiales",
      "Compatibilidad",
      "Total",
    ]);
  });

  it("shows the room, the tile, the materials, the verdict and the quote from tool outputs", () => {
    show(bathroomConversation());
    expect(screen.getByRole("img", { name: "5 cajas cubren 7,2 m² de 6,6 m² con desperdicio" })).toBeTruthy();
    expect(screen.getByText("Piso, interior, zona húmeda, tráfico medio, junta de 3 mm")).toBeTruthy();
    expect(screen.getAllByText("Piso Prueba Blanco 60x60").length).toBeGreaterThan(0);
    expect(screen.getByText("2 bultos")).toBeTruthy();
    expect(screen.getByText("Compatible")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Líneas de la cotización" });
    expect(within(table).getByText("$490.500")).toBeTruthy();
    expect(within(table).getByText("5 cajas a $80.000 por caja")).toBeTruthy();
    expect(screen.getByText("Dentro del presupuesto de $1.500.000. Quedan $1.009.500.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descargar cotización en PDF" })).toBeTruthy();
    expect(screen.getByText("Traza del agente").closest("button")?.textContent).toBe("Traza del agente 6 pasos, 6 herramientas");
    expect(screen.queryByText("Requiere revisión")).toBeNull();
  });

  it("marks quote lines whose quantity did not come from computeMaterials", () => {
    show(bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "G2", quantity: 3 }] }));
    expect(screen.getAllByText("La cantidad de Reparador de Juntas Blanco no salió del cálculo de materiales.").length).toBe(1);
    const row = screen.getByText("Reparador de Juntas Blanco").closest("tr");
    expect(row?.className).toContain("text-review");
  });

  it("never lets a stale quote look clean", () => {
    show(laterRecalculation());
    expect(within(reviewSection()).getByText("La cotización es anterior al último cálculo de materiales; pide una nueva cotización.")).toBeTruthy();
    const total = screen.getByRole("heading", { level: 3, name: "Total" }).closest("section") as HTMLElement;
    expect(within(total).getByText("Requiere revisión")).toBeTruthy();
  });

  it("lists every review item once, in the order deriveProject gives them", () => {
    const messages = bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "G2", quantity: 3 }, { sku: "A1", quantity: 9 }] });
    const project = deriveProject(messages);
    show(messages);
    const items = within(reviewSection()).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(project.review.map((r) => r.reason));
    expect(items.length).toBeGreaterThan(1);
  });

  it("says which tile the materials refer to and flags a different tile in the compatibility check", () => {
    show(withCheckedTile({ sku: "T3", name: "Piso Exterior Terracota 45x45" }));
    expect(screen.getByText("Calculado para Piso Prueba Blanco 60x60 (T1).")).toBeTruthy();
    expect(
      screen.getByText("La compatibilidad se verificó con Piso Exterior Terracota 45x45 (T3), otro revestimiento distinto al de los materiales."),
    ).toBeTruthy();
  });

  it("shows the same tile once when materials and compatibility agree", () => {
    show(bathroomConversation());
    expect(screen.getByText("Calculado para Piso Prueba Blanco 60x60 (T1).")).toBeTruthy();
    expect(screen.queryByText(/otro revestimiento/)).toBeNull();
  });

  it("shows the trace phases the cards show for a compatibility verdict", () => {
    show(withVerdict("incompatible"));
    fireEvent.click(screen.getByText("Traza del agente"));
    expect(screen.getByText(/Compatibilidad: incompatible/)).toBeTruthy();
    expect(screen.queryByText(/Compatibilidad verificada/)).toBeNull();
  });
});

describe("MobileProjectBar", () => {
  it("stays hidden until a tool ran", () => {
    const project = deriveProject([userMessage("Hola")]);
    const { container } = render(
      <MobileProjectBar project={project} busy={false}>
        x
      </MobileProjectBar>,
    );
    expect(container.textContent).toBe("");
  });

  it("shows the total and the review count, and opens the project in a sheet", () => {
    const project = deriveProject(laterRecalculation());
    render(
      <MobileProjectBar project={project} busy={false}>
        <p>contenido</p>
      </MobileProjectBar>,
    );
    const trigger = screen.getByRole("button", { name: /Total \$490\.500/ });
    expect(trigger.textContent).toContain("1 por revisar");
    fireEvent.click(trigger);
    expect(screen.getByText("contenido")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });
});
