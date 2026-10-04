import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function token(block: string, name: string): string {
  const body = css.slice(css.indexOf(`${block} {`));
  const match = body.slice(0, body.indexOf("}")).match(new RegExp(`\\s--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--${name} not found in ${block}`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme tokens", () => {
  it("keeps the floor plan's grout lines at least as distinct on the dark tiles as on the light ones", () => {
    // The plan draws grout (--grout) over the tile fill (--accent). In dark mode the lines were nearly invisible.
    const light = contrast(token(":root", "grout"), token(":root", "accent"));
    const dark = contrast(token(".dark", "grout"), token(".dark", "accent"));
    expect(light).toBeGreaterThan(1.3);
    expect(dark).toBeGreaterThanOrEqual(light);
  });
});
