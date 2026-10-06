import { describe, expect, it } from "vitest";
import {
  normalizeText,
  parseCoverageKgM2,
  parseFormatMm,
  parseJointRangeMm,
  parseKg,
  parseNumbers,
  parseThicknessMm,
  statedM2PerBox,
} from "@/lib/domain/parse";

describe("parseNumbers", () => {
  it("reads comma and dot decimals", () => {
    expect(parseNumbers("7,90 a 8,50 mm")).toEqual([7.9, 8.5]);
    expect(parseNumbers("1.8 m2")).toEqual([1.8, 2]);
  });
  it("returns [] for empty input", () => {
    expect(parseNumbers(null)).toEqual([]);
  });
});

describe("normalizeText", () => {
  it("strips accents, lowercases and collapses whitespace", () => {
    expect(normalizeText("  Áreas   EXTERIORES\nTechadas ")).toBe("areas exteriores techadas");
  });
});

describe("parseFormatMm", () => {
  it("parses the sheet format in cm and returns mm", () => {
    expect(parseFormatMm("60X60 cm")).toEqual({ length: 600, width: 600 });
  });
  it("falls back to the next candidate", () => {
    expect(parseFormatMm(null, "Piso Sibila Blanco 45,2x45,2")).toEqual({ length: 452, width: 452 });
  });
  it("returns null when no candidate has a format", () => {
    expect(parseFormatMm(undefined, "Piso Sin Formato")).toBeNull();
  });
});

describe("parseThicknessMm", () => {
  it("takes the upper bound of a range", () => {
    expect(parseThicknessMm("7,90 a 8,50 mm")).toBe(8.5);
  });
  it("returns null without numbers", () => {
    expect(parseThicknessMm("n/a")).toBeNull();
  });
});

describe("parseCoverageKgM2", () => {
  it("parses a range", () => {
    expect(parseCoverageKgM2("5.0-6.0 kg/m2 según formato")).toEqual({ min: 5, max: 6 });
  });
  it("parses a single value", () => {
    expect(parseCoverageKgM2("aprox. 4 kg/m2")).toEqual({ min: 4, max: 4 });
  });
  it("does not confuse a bag size with coverage", () => {
    expect(parseCoverageKgM2("bulto de 25 kg mezclar con agua")).toBeNull();
  });
  it("returns null for 'go to the sheet' texts", () => {
    expect(parseCoverageKgM2("Ir a ficha técnica")).toBeNull();
  });
});

describe("parseKg", () => {
  it("reads the first candidate with a kg amount", () => {
    expect(parseKg(null, "CONCOLOR® Junta Estrecha 2 Kg Blanco")).toBe(2);
  });
});

describe("parseJointRangeMm", () => {
  it.each([
    ["Permite emboquillar juntas de 1mm a 12mm con una", { min: 1, max: 12 }],
    ["emboquillar las juntas  de 1-12 mm en revestimientos de", { min: 1, max: 12 }],
    ["• Permite emboquillar juntas de 1 -5mm con una", { min: 1, max: 5 }],
    ["juntas desde 1mm de espesor hasta 5 mm. Para un", { min: 1, max: 5 }],
  ])("extracts the range from %s", (text, expected) => {
    expect(parseJointRangeMm(text)).toEqual(expected);
  });
  it.each(["Juntas de 3 mm: 200", "juntas de menos de 3 mm (1/8"])("ignores %s", (text) => {
    expect(parseJointRangeMm(text)).toBeNull();
  });
});

describe("statedM2PerBox", () => {
  it("reads the one value a sheet labels as m² per box", () => {
    expect(statedM2PerBox("M2 POR CAJA SQ FT APPROX 1,8 Color: BLANCO")).toBe(1.8);
  });
  it("returns null when no label precedes a number, or when the label is followed by two different numbers", () => {
    expect(statedM2PerBox("Colección: ORIGENES 2017 ... (±) 2.00% ... m2")).toBeNull();
    expect(statedM2PerBox("M2 POR CAJA SQ FT APPROX 1,8 19,38")).toBeNull();
  });
});
