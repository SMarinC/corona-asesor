import { describe, expect, it } from "vitest";
import { numberAppearsIn, verifyCitedValue } from "@/lib/domain/citations";
import type { SheetChunk } from "@/lib/domain/types";

const chunk: SheetChunk = {
  citationId: "c0042",
  skus: ["604422001"],
  section: "ficha_general",
  docType: "revestimiento",
  text: "M2 POR CAJA SQ FT APPROX 1,8 Color: BLANCO",
};
const find = (id: string) => (id === chunk.citationId ? chunk : undefined);

describe("numberAppearsIn", () => {
  it("matches comma decimals against dot values", () => {
    expect(numberAppearsIn("1,8 m2", 1.8)).toBe(true);
    expect(numberAppearsIn("1,80 m2", 1.8)).toBe(true);
  });
  it("does not match a different number", () => {
    expect(numberAppearsIn("1,8 m2", 1.44)).toBe(false);
  });
});

describe("verifyCitedValue", () => {
  it("accepts a value present in a chunk of the same product", () => {
    expect(verifyCitedValue({ value: 1.8, citationId: "c0042" }, "604422001", find)).toEqual({ ok: true });
  });
  it("rejects an unknown citation", () => {
    expect(verifyCitedValue({ value: 1.8, citationId: "c9999" }, "604422001", find)).toEqual({
      ok: false,
      reason: "unknown_citation",
    });
  });
  it("rejects a citation from another product's sheet", () => {
    expect(verifyCitedValue({ value: 1.8, citationId: "c0042" }, "OTHER", find)).toEqual({
      ok: false,
      reason: "citation_other_product",
    });
  });
  it("rejects a value that is not in the cited text", () => {
    expect(verifyCitedValue({ value: 2.16, citationId: "c0042" }, "604422001", find)).toEqual({
      ok: false,
      reason: "value_not_in_citation",
    });
  });
});
