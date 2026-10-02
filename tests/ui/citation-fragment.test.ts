import { describe, expect, it } from "vitest";
import type { SheetChunk } from "@/lib/domain/types";
import { MAX_FRAGMENT_CHARS, toCitationFragment } from "@/lib/ui/citation-fragment";

const chunk = (over: Partial<SheetChunk>): SheetChunk => ({ citationId: "c0001", section: "S", docType: "ficha", skus: [], text: "t", ...over }) as SheetChunk;

describe("toCitationFragment", () => {
  it("caps the SKU list and reports the real count", () => {
    const skus = Array.from({ length: 25 }, (_, i) => `sku${i}`);
    const f = toCitationFragment(chunk({ skus }));
    expect(f.skus).toEqual(skus.slice(0, 10));
    expect(f.skuCount).toBe(25);
    expect(f.skusTruncated).toBe(true);
  });

  it("does not flag short SKU lists", () => {
    const f = toCitationFragment(chunk({ skus: ["a", "b"] }));
    expect(f).toMatchObject({ skus: ["a", "b"], skuCount: 2, skusTruncated: false });
  });

  it("truncates text over the limit and leaves exact-limit text alone", () => {
    expect(toCitationFragment(chunk({ text: "x".repeat(MAX_FRAGMENT_CHARS) })).truncated).toBe(false);
    const f = toCitationFragment(chunk({ text: "x".repeat(MAX_FRAGMENT_CHARS + 1) }));
    expect(f.truncated).toBe(true);
    expect(f.text).toBe(`${"x".repeat(MAX_FRAGMENT_CHARS)}…`);
  });
});
