import { describe, expect, it } from "vitest";
import { executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { deriveProject, EMPTY_PROJECT } from "@/lib/ui/derive-project";
import { makeToolDeps } from "../fixtures/tool-deps";
import { assistantMessage, bathroomConversation, toolPart, userMessage } from "../fixtures/ui-messages";

describe("deriveProject", () => {
  it("is empty before any tool runs", () => {
    expect(deriveProject([userMessage("Hola")])).toEqual(EMPTY_PROJECT);
  });

  it("builds the whole project from the tool outputs of a quote flow", () => {
    const project = deriveProject(bathroomConversation());
    expect(project.space).toEqual({ lengthM: 3, widthM: 2, areaM2: 6, wastePct: 0.1, areaWithWasteM2: 6.6 });
    expect(project.conditions).toEqual({ surface: "floor", environment: "indoor", wetArea: true, traffic: "medium", jointWidthMm: 3 });
    expect(project.tile).toMatchObject({ sku: "T1", formatMm: { length: 600, width: 600 }, price: 80000, priceUnit: "caja" });
    expect(project.materials?.tile).toMatchObject({ boxes: 5, coveredM2: 7.2 });
    expect(project.materials?.adhesive).toMatchObject({ bags: 2, kg: 30 });
    expect(project.materials?.grout).toMatchObject({ units: 1 });
    expect(project.compatibility?.verdict).toBe("compatible");
    expect(project.quote?.data).toMatchObject({ total: 490500, budget: 1_500_000, withinBudget: true, difference: 1_009_500 });
    expect(project.quote?.lineChecks).toEqual({ T1: "computed", A1: "computed", G1: "computed" });
    expect(project.citations).toEqual(["c0001", "c0002"]);
    expect(project.review).toEqual([]);
    expect(project.toolCalls).toBe(6);
  });

  it("flags quote quantities that computeMaterials never returned or that differ", () => {
    const project = deriveProject(
      bathroomConversation({
        quoteLines: [
          { sku: "T1", quantity: 5 },
          { sku: "A1", quantity: 3 },
          { sku: "G2", quantity: 2 },
        ],
      }),
    );
    expect(project.quote?.lineChecks).toEqual({ T1: "computed", A1: "differs", G2: "not_computed" });
    expect(project.review.map((r) => r.field)).toEqual(["quantity:A1", "quantity:G2"]);
    expect(project.review[1].reason).toBe("La cantidad de Reparador de Juntas Blanco no salió del cálculo de materiales.");
  });

  it("lists what computeMaterials could not compute", () => {
    const deps = makeToolDeps();
    const input = { lengthM: 2, widthM: 2, tileSku: "T4", groutSku: "G1", jointWidthMm: 2 };
    const project = deriveProject([assistantMessage([toolPart("computeMaterials", input, executeComputeMaterials(deps, input))])]);
    expect(project.materials).toEqual({ tile: expect.objectContaining({ sku: "T4" }), adhesive: null, grout: null });
    expect(project.review).toEqual([
      { tool: "computeMaterials", field: "thicknessMm", reason: expect.stringContaining("sin el espesor no se puede calcular la boquilla") },
    ]);
  });

  it("ignores running calls and failed results but still counts them", () => {
    const project = deriveProject([
      assistantMessage([
        toolPart("buildQuote", { lines: [{ sku: "T1", quantity: 1 }] }),
        toolPart("checkCompatibility", { tileSku: "ZZ" }, { status: "error", code: "unknown_sku", message: "No existe" }),
      ]),
    ]);
    expect(project.quote).toBeNull();
    expect(project.compatibility).toBeNull();
    expect(project.toolCalls).toBe(2);
  });

  it("lets a later call of the same tool replace the earlier one", () => {
    const [user, first] = bathroomConversation();
    const deps = makeToolDeps();
    const input = { lengthM: 4, widthM: 3, tileSku: "T1" };
    const second = assistantMessage([toolPart("computeMaterials", input, executeComputeMaterials(deps, input))]);
    const project = deriveProject([user, first, userMessage("Y si mide 4 x 3?"), second]);
    expect(project.space).toMatchObject({ lengthM: 4, widthM: 3, areaM2: 12 });
    expect(project.materials?.adhesive).toBeNull();
  });
});
