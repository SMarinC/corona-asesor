import { describe, expect, it } from "vitest";
import { decodeIndex, dequantizeRow, encodeIndex, l2Normalize, topK } from "@/lib/data/vector";

const rows = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0.7, 0.7, 0, 0],
  [0, 0, 0.2, 0.9],
];

describe("l2Normalize", () => {
  it("produces a unit vector", () => {
    const v = l2Normalize([3, 4]);
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  });
});

describe("index codec", () => {
  it("round-trips rows with small quantization error", () => {
    const index = decodeIndex(encodeIndex(rows, 4), rows.length, 4);
    const restored = dequantizeRow(index, 2);
    const expected = l2Normalize(rows[2]);
    restored.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 2));
  });
  it("encodes count*4 bytes of scales plus count*dims bytes of values", () => {
    expect(encodeIndex(rows, 4).byteLength).toBe(rows.length * 4 + rows.length * 4);
  });
});

describe("topK", () => {
  const index = decodeIndex(encodeIndex(rows, 4), rows.length, 4);

  it("returns the most similar rows first", () => {
    const hits = topK(index, [1, 0.1, 0, 0], 2);
    expect(hits.map((h) => h.row)).toEqual([0, 2]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("applies the row filter", () => {
    expect(topK(index, [1, 0, 0, 0], 2, (row) => row !== 0).map((h) => h.row)).toEqual([2, 1]);
  });
});
