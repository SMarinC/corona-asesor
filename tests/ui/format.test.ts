import { describe, expect, it } from "vitest";
import { formatCOP, formatDuration, formatFormat, formatM2, formatNumber, formatQuantity, formatWait } from "@/lib/ui/format";

describe("format", () => {
  it("writes pesos with dot thousands and no decimals", () => {
    expect(formatCOP(612300)).toBe("$612.300");
    expect(formatCOP(330012.4)).toBe("$330.012");
    expect(formatCOP(1500000)).toBe("$1.500.000");
    expect(formatCOP(-42935)).toBe("-$42.935");
    expect(formatCOP(0)).toBe("$0");
  });

  it("uses a decimal comma", () => {
    expect(formatNumber(6.6)).toBe("6,6");
    expect(formatNumber(1.823)).toBe("1,82");
    expect(formatM2(7.28)).toBe("7,28 m²");
    expect(formatFormat({ length: 552, width: 552 })).toBe("55,2 × 55,2 cm");
    expect(formatFormat({ length: 600, width: 1200 })).toBe("60 × 120 cm");
  });

  it("formats durations and waits", () => {
    expect(formatDuration(45)).toBe("45 ms");
    expect(formatDuration(834)).toBe("0,8 s");
    expect(formatDuration(6190)).toBe("6,2 s");
    expect(formatWait(9.2)).toBe("10 s");
    expect(formatWait(170)).toBe("3 min");
    expect(formatWait(7500)).toBe("2 h 05 min");
    expect(formatWait(7200)).toBe("2 h");
  });

  it("pluralizes units", () => {
    expect(formatQuantity(1, "caja")).toBe("1 caja");
    expect(formatQuantity(4, "caja")).toBe("4 cajas");
    expect(formatQuantity(2, "bulto")).toBe("2 bultos");
    expect(formatQuantity(3, "unidad")).toBe("3 unidades");
  });
});
