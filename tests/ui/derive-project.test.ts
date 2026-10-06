import { describe, expect, it } from "vitest";
import { executeBuildQuote } from "@/lib/agent/tools/build-quote";
import { executeCheckCompatibility } from "@/lib/agent/tools/check-compatibility";
import { executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { deriveProject, EMPTY_PROJECT } from "@/lib/ui/derive-project";
import { needsReview } from "@/lib/ui/project-view";
import { makeToolDeps } from "../fixtures/tool-deps";
import { assistantMessage, bathroomConversation, toolPart, userMessage } from "../fixtures/ui-messages";
import { withCheckedTile } from "../fixtures/project-variants";

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

  it("marks the earlier quote stale after a follow-up calculation instead of relabeling its lines", () => {
    const [user, first] = bathroomConversation();
    const deps = makeToolDeps();
    const input = { lengthM: 4, widthM: 3, tileSku: "T1" };
    const second = assistantMessage([toolPart("computeMaterials", input, executeComputeMaterials(deps, input))]);
    const project = deriveProject([user, first, userMessage("Y si mide 4 x 3?"), second]);
    expect(project.quote?.stale).toBe(true);
    expect(project.quote?.lineChecks).toEqual({ T1: "computed", A1: "computed", G1: "computed" });
    expect(project.review).toEqual([
      { tool: "buildQuote", field: "stale", reason: "La cotización es anterior al último cálculo de materiales; pide una nueva cotización." },
    ]);
  });

  it("is not stale when the quote came after the last calculation", () => {
    expect(deriveProject(bathroomConversation()).quote?.stale).toBe(false);
  });

  it("accepts quantities summed across the calculations since the previous quote (multi-surface)", () => {
    const deps = makeToolDeps();
    const floor = { lengthM: 3, widthM: 2, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };
    const other = { lengthM: 2, widthM: 2, tileSku: "T3", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };
    const a = executeComputeMaterials(deps, floor);
    const b = executeComputeMaterials(deps, other);
    if (a.status !== "ok" || b.status !== "ok") throw new Error("fixture: both calculations should be ok");
    const lines = [
      { sku: "T1", quantity: a.data.tile.boxes },
      { sku: "T3", quantity: b.data.tile.boxes },
      { sku: "A1", quantity: a.data.adhesive!.bags + b.data.adhesive!.bags },
      { sku: "G1", quantity: a.data.grout!.units + b.data.grout!.units },
    ];
    const quoteInput = { lines };
    const project = deriveProject([
      assistantMessage([
        toolPart("computeMaterials", floor, a),
        toolPart("computeMaterials", other, b),
        toolPart("buildQuote", quoteInput, executeBuildQuote(deps, quoteInput)),
      ]),
    ]);
    expect(project.quote?.lineChecks).toEqual({ T1: "computed", T3: "computed", A1: "computed", G1: "computed" });
    expect(project.quote?.stale).toBe(false);
    expect(project.review).toEqual([]);
  });

  it("still catches an invented grout quantity", () => {
    const lines = [{ sku: "T1", quantity: 5 }, { sku: "A1", quantity: 2 }, { sku: "G2", quantity: 3 }];
    const project = deriveProject(bathroomConversation({ quoteLines: lines }));
    expect(project.quote?.lineChecks.G2).toBe("not_computed");
    expect(project.review.map((r) => r.field)).toEqual(["quantity:G2"]);
    const wrong = deriveProject(bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "A1", quantity: 2 }, { sku: "G1", quantity: 7 }] }));
    expect(wrong.quote?.lineChecks.G1).toBe("differs");
  });

  it("lists a quantity once when buildQuote's guard already flagged it", () => {
    const conversation = bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "A1", quantity: 2 }, { sku: "G1", quantity: 7 }] });
    const quotePart = conversation[1].parts.find((p) => p.type === "tool-buildQuote") as { output: { status: string; missing?: unknown[] } };
    quotePart.output = {
      ...quotePart.output,
      status: "needs_review",
      missing: [{ field: "quantity:G1", reason: "La cantidad de Boquilla (7) no coincide con el último cálculo de computeMaterials." }],
    };
    const fields = deriveProject(conversation).review.map((item) => item.field);
    expect(fields.filter((field) => field === "quantity:G1")).toHaveLength(1);
  });

  it("keeps the server's quantity reason when the full local history says the line is computed (trimmed server history)", () => {
    const conversation = bathroomConversation();
    const quotePart = conversation[1].parts.find((p) => p.type === "tool-buildQuote") as { output: { status: string; missing?: unknown[] } };
    quotePart.output = {
      ...quotePart.output,
      status: "needs_review",
      missing: [{ field: "quantity:G1", reason: "La cantidad de Boquilla (1) no salió de computeMaterials." }],
    };
    const project = deriveProject(conversation);
    expect(project.quote?.lineChecks.G1).toBe("computed");
    expect(project.review).toEqual([{ tool: "buildQuote", field: "quantity:G1", reason: "La cantidad de Boquilla (1) no salió de computeMaterials." }]);
  });

  it("keeps the floor's calculation when a later quote adds a wall, and catches a recomputed floor", () => {
    const deps = makeToolDeps();
    const floor = { lengthM: 3, widthM: 2, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };
    const wall = { lengthM: 2, widthM: 2, tileSku: "T3", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };
    const bigger = { ...floor, lengthM: 6, widthM: 5 };
    const run = (input: typeof floor) => {
      const result = executeComputeMaterials(deps, input);
      if (result.status !== "ok") throw new Error("fixture: calculation should be ok");
      return { result, part: toolPart("computeMaterials", input, result) };
    };
    const f = run(floor);
    const w = run(wall);
    const b = run(bigger);
    const quote = (lines: { sku: string; quantity: number }[]) => toolPart("buildQuote", { lines }, executeBuildQuote(deps, { lines }));
    const floorLines = [{ sku: "T1", quantity: f.result.data.tile.boxes }];
    const bothLines = [
      ...floorLines,
      { sku: "T3", quantity: w.result.data.tile.boxes },
      { sku: "A1", quantity: f.result.data.adhesive!.bags + w.result.data.adhesive!.bags },
    ];
    const both = deriveProject([assistantMessage([f.part, quote(floorLines), w.part, quote(bothLines)])]);
    expect(both.quote?.lineChecks).toEqual({ T1: "computed", T3: "computed", A1: "computed" });
    expect(both.review).toEqual([]);

    const old = deriveProject([assistantMessage([f.part, quote(floorLines), b.part, quote(floorLines)])]);
    expect(old.quote?.lineChecks).toEqual({ T1: "differs" });
    expect(old.review.map((r) => r.field)).toEqual(["quantity:T1"]);
  });

  it("does not accept the grout quantity of another tile alternative for the same floor", () => {
    const deps = makeToolDeps();
    const big = { lengthM: 10, widthM: 8, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };
    const alt = { ...big, tileSku: "T3" };
    const run = (input: typeof big) => {
      const result = executeComputeMaterials(deps, input);
      if (result.status !== "ok") throw new Error("fixture: calculation should be ok");
      return { result, part: toolPart("computeMaterials", input, result) };
    };
    const t1 = run(big);
    const t3 = run(alt);
    expect(t3.result.data.grout!.units).not.toBe(t1.result.data.grout!.units);
    const quote = (lines: { sku: string; quantity: number }[]) => toolPart("buildQuote", { lines }, executeBuildQuote(deps, { lines }));
    const first = [{ sku: "T1", quantity: t1.result.data.tile.boxes }, { sku: "G1", quantity: t1.result.data.grout!.units }];
    const second = [{ sku: "T3", quantity: t3.result.data.tile.boxes }, { sku: "G1", quantity: t1.result.data.grout!.units }];
    const project = deriveProject([assistantMessage([t1.part, quote(first), t3.part, quote(second)])]);
    expect(project.quote?.lineChecks).toEqual({ T3: "computed", G1: "differs" });
    expect(project.review.map((r) => r.field)).toEqual(["quantity:G1"]);
  });

  it("marks every line not_computed when the quote has no calculation at all", () => {
    const deps = makeToolDeps();
    const input = { lines: [{ sku: "T1", quantity: 5 }, { sku: "A1", quantity: 2 }] };
    const project = deriveProject([assistantMessage([toolPart("buildQuote", input, executeBuildQuote(deps, input))])]);
    expect(project.quote?.lineChecks).toEqual({ T1: "not_computed", A1: "not_computed" });
    expect(project.review.map((r) => r.field)).toEqual(["quantity:T1", "quantity:A1"]);
  });

  it("keeps a re-quote with no new calculation checked against the previous one", () => {
    const [user, first] = bathroomConversation();
    const deps = makeToolDeps();
    const input = { lines: [{ sku: "T1", quantity: 5 }], budget: 100_000 };
    const again = assistantMessage([toolPart("buildQuote", input, executeBuildQuote(deps, input))]);
    const project = deriveProject([user, first, userMessage("Y con 100.000?"), again]);
    expect(project.quote?.lineChecks).toEqual({ T1: "computed" });
    expect(project.quote?.stale).toBe(false);
  });

  it("shows a quote with missing prices as needing review, without a budget verdict", () => {
    const deps = makeToolDeps();
    const input = { lines: [{ sku: "T4", quantity: 1 }], budget: 100_000 };
    const result = executeBuildQuote(deps, input);
    expect(result.status).toBe("needs_review");
    const project = deriveProject([assistantMessage([toolPart("buildQuote", input, result)])]);
    expect(project.quote?.needsReview).toBe(true);
    expect(project.quote?.data.withinBudget).toBeNull();
    expect(project.quote?.data.difference).toBeNull();
    expect(project.review.filter((r) => r.field.startsWith("price:")).map((r) => r.field)).toEqual(["price:T4"]);
  });

  it("keeps a needs_review compatibility verdict and lists its review checks", () => {
    const deps = makeToolDeps();
    const input = { tileSku: "T4", surface: "floor", environment: "indoor", wetArea: true, traffic: "medium", jointWidthMm: 3 } as const;
    const result = executeCheckCompatibility(deps, input);
    if (result.status !== "ok") throw new Error("fixture: checkCompatibility should return data");
    expect(result.data.verdict).toBe("needs_review");
    const expected = result.data.checks.filter((c) => c.verdict === "needs_review");
    expect(expected.length).toBeGreaterThan(0);
    const project = deriveProject([assistantMessage([toolPart("checkCompatibility", input, result)])]);
    expect(project.compatibility?.verdict).toBe("needs_review");
    expect(project.review).toEqual(expected.map((c) => ({ tool: "checkCompatibility", field: `check:${c.rule}`, reason: c.message })));
  });

  it("flags the quote when the compatibility check used another tile than the materials", () => {
    const project = deriveProject(withCheckedTile({ sku: "T3", name: "Piso Exterior Terracota 45x45" }));
    expect(project.review).toEqual([
      {
        tool: "checkCompatibility",
        field: "tile_mismatch",
        reason: "La compatibilidad se verificó con otro revestimiento; pide verificar el revestimiento cotizado.",
      },
    ]);
    expect(needsReview(project)).toBe(true);
    expect(deriveProject(bathroomConversation()).review).toEqual([]);
  });

  it("does not let a superseded what-if calculation validate a quantity (last call wins per tile)", () => {
    const deps = makeToolDeps();
    const room = { lengthM: 3, widthM: 2, tileSku: "T1" };
    const bigger = { lengthM: 4, widthM: 3, tileSku: "T1" };
    const a = executeComputeMaterials(deps, room);
    const b = executeComputeMaterials(deps, bigger);
    if (a.status === "error" || b.status === "error") throw new Error("fixture: calculations should return data");
    expect(a.data.tile?.boxes).not.toBe(b.data.tile?.boxes);
    const quoteInput = { lines: [{ sku: "T1", quantity: a.data.tile!.boxes }] };
    const project = deriveProject([
      assistantMessage([
        toolPart("computeMaterials", room, a),
        toolPart("computeMaterials", bigger, b),
        toolPart("buildQuote", quoteInput, executeBuildQuote(deps, quoteInput)),
      ]),
    ]);
    expect(project.materials?.tile?.boxes).toBe(b.data.tile?.boxes);
    expect(project.quote?.lineChecks).toEqual({ T1: "differs" });
    expect(project.review.map((r) => r.field)).toEqual(["quantity:T1"]);
  });

  it("does not launder an invented line or a wrong quantity through a re-quote", () => {
    const [user, first] = bathroomConversation();
    const deps = makeToolDeps();
    const input = { lines: [{ sku: "T1", quantity: 5 }, { sku: "A1", quantity: 9 }, { sku: "G2", quantity: 3 }] };
    const again = assistantMessage([toolPart("buildQuote", input, executeBuildQuote(deps, input))]);
    const project = deriveProject([user, first, userMessage("Agrega reparador"), again]);
    expect(project.quote?.lineChecks).toEqual({ T1: "computed", A1: "differs", G2: "not_computed" });
    expect(project.review.map((r) => r.field)).toEqual(["quantity:A1", "quantity:G2"]);
  });
});
