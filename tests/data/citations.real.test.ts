import { describe, expect, it } from "vitest";
import { verifyCitedValue } from "@/lib/domain/citations";
import { loadSheetArtifacts } from "@/lib/data/sheets";

describe("verifyCitedValue on the real sheets", () => {
  const { chunks } = loadSheetArtifacts();
  const find = (id: string) => chunks.find((c) => c.citationId === id);

  it("verifies 2 m2PerBox for SKU 257049001 only in the chunk that labels it 'M2 POR CAJA'", () => {
    // The sheet really says "M2 POR CAJA ... 2" (32 pieces of 25x25 cm = 2 m2); incidental 2s elsewhere must not verify.
    const own = chunks.filter((c) => c.skus.includes("257049001"));
    const verified = own
      .filter((c) => verifyCitedValue({ value: 2, citationId: c.citationId }, "257049001", find, "m2PerBox").ok)
      .map((c) => c.citationId);
    expect(verified).toEqual(["c0170"]);
  });

  it("does not verify an unrelated m2PerBox for SKU 257049001 in any of its chunks", () => {
    for (const c of chunks.filter((c) => c.skus.includes("257049001"))) {
      for (const value of [1, 3, 2017]) {
        expect(verifyCitedValue({ value, citationId: c.citationId }, "257049001", find, "m2PerBox").ok).toBe(false);
      }
    }
  });

  it("verifies 1.8 m2PerBox for SKU 604422001 in at least one chunk", () => {
    const own = chunks.filter((c) => c.skus.includes("604422001"));
    expect(
      own.some((c) => verifyCitedValue({ value: 1.8, citationId: c.citationId }, "604422001", find, "m2PerBox").ok),
    ).toBe(true);
  });
});
