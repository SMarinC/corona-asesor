import { describe, expect, it } from "vitest";
import {
  computeAdhesive,
  computeArea,
  computeBoxes,
  computeGrout,
  DEFAULT_WASTE_PCT,
} from "@/lib/domain/calculations";

describe("computeArea", () => {
  it("adds 10% waste by default", () => {
    expect(computeArea(4, 3)).toEqual({ areaM2: 12, wastePct: DEFAULT_WASTE_PCT, areaWithWasteM2: 13.2 });
  });
  it("supports zero waste", () => {
    expect(computeArea(5, 2, 0).areaWithWasteM2).toBe(10);
  });
  it.each([
    [0, 3, 0.1],
    [4, -1, 0.1],
    [4, 3, 0.6],
    [4, 3, -0.1],
  ])("rejects invalid input (%s, %s, %s)", (l, w, waste) => {
    expect(() => computeArea(l, w, waste)).toThrow(RangeError);
  });
});

describe("computeBoxes", () => {
  it("rounds boxes up", () => {
    expect(computeBoxes(13.2, 1.44)).toEqual({ boxes: 10, coveredM2: 14.4 });
  });
  it("does not add a box because of floating-point noise", () => {
    expect(computeBoxes(5.4, 1.8).boxes).toBe(3);
  });
  it("rejects a non-positive box coverage", () => {
    expect(() => computeBoxes(10, 0)).toThrow(RangeError);
  });
});

describe("computeAdhesive", () => {
  it("computes kilograms and whole bags", () => {
    expect(computeAdhesive(13.2, 4.5, 25)).toEqual({ kg: 59.4, bags: 3 });
  });
});

describe("computeGrout", () => {
  it("applies the joint-volume formula", () => {
    // ((600+600)/(600*600)) * 3 * 9 * 1.6 = 0.144 kg/m2
    expect(computeGrout(13.2, { length: 600, width: 600 }, 9, 3, 2)).toEqual({
      consumptionKgM2: 0.144,
      kg: 1.9,
      units: 1,
    });
  });
  it("needs more grout for smaller tiles", () => {
    const small = computeGrout(10, { length: 200, width: 200 }, 8, 3, 2);
    const large = computeGrout(10, { length: 600, width: 600 }, 8, 3, 2);
    expect(small.kg).toBeGreaterThan(large.kg);
  });
  it("rejects a non-positive density", () => {
    expect(() => computeGrout(10, { length: 600, width: 600 }, 9, 3, 2, 0)).toThrow(RangeError);
  });
});
