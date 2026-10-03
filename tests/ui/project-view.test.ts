import { describe, expect, it } from "vitest";
import { deriveProject } from "@/lib/ui/derive-project";
import { needsReview, pdfText, tileMismatch } from "@/lib/ui/project-view";
import { bathroomConversation } from "../fixtures/ui-messages";
import { laterRecalculation, withCheckedTile } from "../fixtures/project-variants";

describe("project view helpers", () => {
  it("does not flag a clean project", () => {
    const project = deriveProject(bathroomConversation());
    expect(needsReview(project)).toBe(false);
    expect(tileMismatch(project)).toBeNull();
  });

  it("flags a stale quote even though quote.needsReview stays false", () => {
    const project = deriveProject(laterRecalculation());
    expect(project.quote?.needsReview).toBe(false);
    expect(project.quote?.stale).toBe(true);
    expect(needsReview(project)).toBe(true);
  });

  it("flags review items from quote lines the calculator never produced", () => {
    expect(needsReview(deriveProject(bathroomConversation({ quoteLines: [{ sku: "T4", quantity: 2 }] })))).toBe(true);
  });

  it("names both tiles when the compatibility check used another tile than the materials", () => {
    const project = deriveProject(withCheckedTile({ sku: "T3", name: "Piso Exterior Terracota 45x45" }));
    expect(tileMismatch(project)).toEqual({
      materials: { sku: "T1", name: "Piso Prueba Blanco 60x60" },
      checked: { sku: "T3", name: "Piso Exterior Terracota 45x45" },
    });
  });

  it("rewrites characters Helvetica cannot encode", () => {
    expect(pdfText("Pegante ↔ material")).toBe("Pegante y material");
    expect(pdfText("área ≥ 6 m²")).toBe("área >= 6 m²");
  });

});
