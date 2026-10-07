import { describe, expect, it } from "vitest";
import { STAGE_TOOLS, stageFromHistory } from "@/lib/agent/stage";
import { executeGetProduct } from "@/lib/agent/tools/get-product";
import { executeSearchSupplies } from "@/lib/agent/tools/search-supplies";
import { executeSearchTiles } from "@/lib/agent/tools/search-tiles";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { assistantMessage, bathroomConversation, errorPart, toolPart, userMessage } from "@/tests/fixtures/ui-messages";

const deps = makeToolDeps();
const tilesFound = () => toolPart("searchTiles", { surface: "floor" }, executeSearchTiles(deps, { surface: "floor" }));
const suppliesFound = () => toolPart("searchSupplies", { kind: "adhesive" }, executeSearchSupplies(deps, { kind: "adhesive" }));
const product = (sku: string) => toolPart("getProduct", { sku }, executeGetProduct(deps, { sku }));
/** The conversation so far, then the customer's new message: the stage reads only the earlier assistant turns. */
const before = (...turns: ReturnType<typeof tilesFound>[][]) => [...turns.flatMap((parts) => [userMessage("…"), assistantMessage(parts)]), userMessage("Sigue.")];

describe("stageFromHistory", () => {
  it("explores until an earlier turn proposed a tile", () => {
    expect(stageFromHistory([userMessage("Hola")])).toBe("explore");
    expect(stageFromHistory(before([toolPart("searchTiles", {}, { status: "ok", data: { results: [], note: "Sin resultados" } })]))).toBe("explore");
    expect(stageFromHistory(before([errorPart("searchTiles", {}, "boom")]))).toBe("explore");
    expect(stageFromHistory(before([toolPart("searchTiles", { surface: "floor" })]))).toBe("explore");
    expect(stageFromHistory(before([product("A1")]))).toBe("explore");
    expect(stageFromHistory(before([product("ZZ9")]))).toBe("explore");
  });

  it("moves to supplies once an earlier turn proposed tiles, by search or by SKU", () => {
    expect(stageFromHistory(before([tilesFound()]))).toBe("supplies");
    expect(stageFromHistory(before([product("T1")]))).toBe("supplies");
  });

  it("moves to the quote once an earlier turn proposed supplies", () => {
    expect(stageFromHistory(before([tilesFound()], [suppliesFound()]))).toBe("quote");
    expect(stageFromHistory([...bathroomConversation(), userMessage("Vuelve a cotizar")])).toBe("quote");
  });

  it("keeps the earlier stages' tools in every later stage, so the customer can change their mind", () => {
    expect(STAGE_TOOLS.explore).toEqual(["searchTiles", "getProduct", "getCompanyInfo", "searchTechnicalSheets"]);
    expect(STAGE_TOOLS.supplies).toEqual([...STAGE_TOOLS.explore, "searchSupplies", "checkCompatibility"]);
    expect(STAGE_TOOLS.quote).toEqual([...STAGE_TOOLS.supplies, "computeMaterials", "buildQuote"]);
    // Back to the tiles after the supplies: the stage stays at the quote, where searchTiles is still active.
    const changed = before([tilesFound()], [suppliesFound()], [tilesFound()]);
    expect(stageFromHistory(changed)).toBe("quote");
    expect(STAGE_TOOLS[stageFromHistory(changed)]).toContain("searchTiles");
  });
});
