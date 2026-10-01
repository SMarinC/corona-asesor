import { describe, expect, it } from "vitest";
import { verifyCitedValue } from "@/lib/domain/citations";
import type { SheetChunk } from "@/lib/domain/types";

const chunk: SheetChunk = {
  citationId: "c0042",
  skus: ["604422001"],
  section: "ficha_general",
  docType: "revestimiento",
  text: "M2 POR CAJA SQ FT APPROX 1,8 Color: BLANCO",
};
const find = (id: string) => (id === chunk.citationId ? chunk : undefined);

describe("verifyCitedValue", () => {
  it("accepts a value present in a chunk of the same product", () => {
    expect(verifyCitedValue({ value: 1.8, citationId: "c0042" }, "604422001", find, "m2PerBox")).toEqual({ ok: true });
  });
  it("rejects an unknown citation", () => {
    expect(verifyCitedValue({ value: 1.8, citationId: "c9999" }, "604422001", find, "m2PerBox")).toEqual({
      ok: false,
      reason: "unknown_citation",
    });
  });
  it("rejects a citation from another product's sheet", () => {
    expect(verifyCitedValue({ value: 1.8, citationId: "c0042" }, "OTHER", find, "m2PerBox")).toEqual({
      ok: false,
      reason: "citation_other_product",
    });
  });
  it("rejects a value that is not in the cited text", () => {
    expect(verifyCitedValue({ value: 2.16, citationId: "c0042" }, "604422001", find, "m2PerBox")).toEqual({
      ok: false,
      reason: "value_not_in_citation",
    });
  });

  const textFinder = (text: string) => (id: string) =>
    id === "c1" ? ({ citationId: "c1", skus: ["S"], section: "x", docType: "x", text } as SheetChunk) : undefined;
  const check = (text: string, value: number, field: "m2PerBox" | "coverageKgM2" | "bagKg") =>
    verifyCitedValue({ value, citationId: "c1" }, "S", textFinder(text), field);

  it("rejects 2 for m2PerBox when no 'por caja' label precedes it", () => {
    const text = "Colección: ORIGENES 2017 ... (±) 2.00% ... m2";
    expect(check(text, 2, "m2PerBox")).toEqual({ ok: false, reason: "value_not_in_citation" });
  });
  it("accepts only the upper bound 7 of a kg/m2 range, not the lower bound 5 nor 2", () => {
    const text = "5.0-7.0 kg/m2 según formato";
    expect(check(text, 5, "coverageKgM2")).toEqual({ ok: false, reason: "value_not_in_citation" });
    expect(check(text, 7, "coverageKgM2")).toEqual({ ok: true });
    expect(check("Rendimiento 4 kg/m2", 4, "coverageKgM2")).toEqual({ ok: true });
    expect(check(text, 2, "coverageKgM2")).toEqual({ ok: false, reason: "value_not_in_citation" });
  });
  it("accepts a bag size in kg but not a coverage figure", () => {
    expect(check("Bulto x 25 kg", 25, "bagKg")).toEqual({ ok: true });
    expect(check("5 kg/m2", 5, "bagKg")).toEqual({ ok: false, reason: "value_not_in_citation" });
  });
});
