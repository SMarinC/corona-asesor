import { describe, expect, it } from "vitest";
import { createGetProductTool, executeGetProduct } from "@/lib/agent/tools/get-product";
import { createSearchSuppliesTool } from "@/lib/agent/tools/search-supplies";
import { createSearchTilesTool } from "@/lib/agent/tools/search-tiles";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

describe("getProduct tool", () => {
  const deps = makeToolDeps();

  it("returns the full normalized product", () => {
    const result = executeGetProduct(deps, { sku: "T1" });
    expect(result).toMatchObject({ status: "ok", data: { product: { sku: "T1", kind: "tile", m2PerBox: 1.44 } } });
  });

  it("returns unknown_sku as data", () => {
    expect(executeGetProduct(deps, { sku: "ZZ9" })).toMatchObject({ status: "error", code: "unknown_sku" });
  });

  it("wires toModelOutput on every product tool so image URLs stay out of the model context", () => {
    for (const t of [createGetProductTool(deps), createSearchTilesTool(deps), createSearchSuppliesTool(deps)]) {
      expect(t.toModelOutput).toBeTypeOf("function");
    }
    const output = executeGetProduct(deps, { sku: "T1" });
    const model = createGetProductTool(deps).toModelOutput!({ output } as never) as { value: unknown };
    expect(JSON.stringify(model.value)).not.toContain("corona.co/medias");
  });
});
