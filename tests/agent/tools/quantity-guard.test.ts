import { describe, expect, it } from "vitest";
import { createBuildQuoteTool, executeBuildQuote } from "@/lib/agent/tools/build-quote";
import { createComputeMaterialsTool } from "@/lib/agent/tools/compute-materials";
import { seedQuantityLedger } from "@/lib/agent/tools/quantity-history";
import { createQuantityLedger } from "@/lib/domain/quantity-check";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { bathroomConversation } from "@/tests/fixtures/ui-messages";
import { callTool } from "@/tests/helpers/call-tool";

const materialsInput = { lengthM: 3, widthM: 2, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };

describe("buildQuote quantity guard", () => {
  it("is off without a ledger (unit tests and callers that opt out)", () => {
    expect(executeBuildQuote(makeToolDeps(), { lines: [{ sku: "T1", quantity: 99 }] })).toMatchObject({ status: "ok" });
  });

  it("accepts the quantities computeMaterials returned in the same turn", async () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    const materials = await callTool<{ status: string; data: { tile: { boxes: number }; adhesive: { bags: number }; grout: { units: number } } }>(
      createComputeMaterialsTool(deps),
      materialsInput,
    );
    const { tile, adhesive, grout } = materials.data;
    const quote = await callTool(createBuildQuoteTool(deps), {
      lines: [{ sku: "T1", quantity: tile.boxes }, { sku: "A1", quantity: adhesive.bags }, { sku: "G1", quantity: grout.units }],
    });
    expect(quote).toMatchObject({ status: "ok" });
  });

  it("prices but flags a quantity no calculation produced, and one that differs", async () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    await callTool(createComputeMaterialsTool(deps), { ...materialsInput, groutSku: undefined, jointWidthMm: undefined });
    const quote = await callTool(createBuildQuoteTool(deps), { lines: [{ sku: "T1", quantity: 99 }, { sku: "G1", quantity: 3 }] });
    expect(quote).toMatchObject({
      status: "needs_review",
      data: { total: expect.any(Number) },
      missing: [
        { field: "quantity:T1", reason: expect.stringContaining("no coincide con el último cálculo") },
        { field: "quantity:G1", reason: expect.stringContaining("no salió de computeMaterials") },
      ],
    });
  });

  it("checks a later turn's quote against the calculations replayed from the history", () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    seedQuantityLedger(deps.quantities, bathroomConversation());
    const quote = bathroomConversation()[1].parts.find((p) => p.type === "tool-buildQuote") as { input: { lines: { sku: string; quantity: number }[] } };
    // A re-quote with no new calculation keeps the previous set.
    expect(executeBuildQuote(deps, { lines: quote.input.lines })).toMatchObject({ status: "ok" });
    expect(executeBuildQuote(deps, { lines: [{ sku: "G1", quantity: 9 }] })).toMatchObject({ status: "needs_review", missing: [{ field: "quantity:G1" }] });
  });

  it("skips calls that failed when replaying the history", () => {
    const ledger = createQuantityLedger();
    seedQuantityLedger(ledger, [
      { role: "assistant", parts: [{ type: "tool-computeMaterials", state: "output-available", input: { tileSku: "T1" }, output: { status: "error" } }] },
    ]);
    expect(ledger.takeForQuote()).toEqual([]);
  });

  it("flags (needs_review, never an error) a re-quote whose calculation was trimmed out of the history", async () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    // The client keeps only the last messages: here the earlier computeMaterials part is gone.
    const trimmed = bathroomConversation().map((m) => ({ ...m, parts: m.parts.filter((p) => p.type !== "tool-computeMaterials") }));
    seedQuantityLedger(deps.quantities, trimmed);
    const result = await callTool(createBuildQuoteTool(deps), { lines: [{ sku: "T1", quantity: 5 }] });
    expect(result).toMatchObject({ status: "needs_review", data: { total: expect.any(Number) }, missing: [{ field: "quantity:T1" }] });
  });
});

describe("buildQuote quantity guard: what-ifs and several surfaces", () => {
  type Materials = { status: string; data: { tile: { boxes: number }; adhesive: { bags: number }; grout: { units: number } } };

  it("flags a quote at the superseded value of a what-if for the same tile", async () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    const compute = createComputeMaterialsTool(deps);
    const first = await callTool<Materials>(compute, materialsInput);
    const second = await callTool<Materials>(compute, { ...materialsInput, lengthM: 6, widthM: 5 });
    expect(second.data.tile.boxes).not.toBe(first.data.tile.boxes);
    const stale = await callTool(createBuildQuoteTool(deps), { lines: [{ sku: "T1", quantity: first.data.tile.boxes }] });
    expect(stale).toMatchObject({ status: "needs_review", missing: [{ field: "quantity:T1", reason: expect.stringContaining("no coincide") }] });
  });

  it("accepts the sum of two surfaces calculated in the same turn", async () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    const compute = createComputeMaterialsTool(deps);
    const a = await callTool<Materials>(compute, materialsInput);
    const b = await callTool<Materials>(compute, { ...materialsInput, lengthM: 2, widthM: 2, tileSku: "T3" });
    const quote = await callTool(createBuildQuoteTool(deps), {
      lines: [
        { sku: "T1", quantity: a.data.tile.boxes },
        { sku: "T3", quantity: b.data.tile.boxes },
        { sku: "A1", quantity: a.data.adhesive.bags + b.data.adhesive.bags },
        { sku: "G1", quantity: a.data.grout.units + b.data.grout.units },
      ],
    });
    expect(quote).toMatchObject({ status: "ok" });
  });
});

describe("buildQuote quantity guard: floor, then wall in a later quote", () => {
  type Materials = { data: { tile: { boxes: number }; adhesive: { bags: number }; grout: { units: number } } };

  it("checks the second quote against both surfaces, and still catches a recomputed floor", async () => {
    const deps = { ...makeToolDeps(), quantities: createQuantityLedger() };
    const compute = createComputeMaterialsTool(deps);
    const quoteTool = createBuildQuoteTool(deps);
    const floor = await callTool<Materials>(compute, materialsInput);
    expect(await callTool(quoteTool, { lines: [{ sku: "T1", quantity: floor.data.tile.boxes }] })).toMatchObject({ status: "ok" });
    const wall = await callTool<Materials>(compute, { ...materialsInput, lengthM: 2, widthM: 2, tileSku: "T3" });
    const both = await callTool(quoteTool, {
      lines: [
        { sku: "T1", quantity: floor.data.tile.boxes },
        { sku: "T3", quantity: wall.data.tile.boxes },
        { sku: "A1", quantity: floor.data.adhesive.bags + wall.data.adhesive.bags },
      ],
    });
    expect(both).toMatchObject({ status: "ok" });
    const bigger = await callTool<Materials>(compute, { ...materialsInput, lengthM: 6, widthM: 5 });
    expect(bigger.data.tile.boxes).not.toBe(floor.data.tile.boxes);
    const old = await callTool(quoteTool, { lines: [{ sku: "T1", quantity: floor.data.tile.boxes }] });
    expect(old).toMatchObject({ status: "needs_review", missing: [{ field: "quantity:T1" }] });
  });
});
