export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

export interface QuantizedIndex {
  count: number;
  dims: number;
  /** Per-row dequantization scale. */
  scales: Float32Array;
  /** Row-major int8 values, `count × dims`. */
  values: Int8Array;
}

export function l2Normalize(v: ArrayLike<number>): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** Layout: count × float32 LE scales, then count × dims int8 values. */
export function encodeIndex(rows: ArrayLike<number>[], dims: number): Uint8Array {
  const bytes = new Uint8Array(rows.length * 4 + rows.length * dims);
  const view = new DataView(bytes.buffer);
  const values = new Int8Array(bytes.buffer, rows.length * 4);
  rows.forEach((row, r) => {
    if (row.length !== dims) throw new Error(`row ${r} has ${row.length} dims, expected ${dims}`);
    const unit = l2Normalize(row);
    let maxAbs = 0;
    for (const x of unit) maxAbs = Math.max(maxAbs, Math.abs(x));
    const scale = maxAbs / 127 || 1;
    view.setFloat32(r * 4, scale, true);
    for (let i = 0; i < dims; i++) values[r * dims + i] = Math.round(unit[i] / scale);
  });
  return bytes;
}

export function decodeIndex(bytes: Uint8Array, count: number, dims: number): QuantizedIndex {
  const expected = count * 4 + count * dims;
  if (bytes.byteLength !== expected) {
    throw new Error(`index has ${bytes.byteLength} bytes, expected ${expected}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scales = new Float32Array(count);
  for (let r = 0; r < count; r++) scales[r] = view.getFloat32(r * 4, true);
  const values = new Int8Array(bytes.buffer.slice(bytes.byteOffset + count * 4, bytes.byteOffset + expected));
  return { count, dims, scales, values };
}

export function dequantizeRow(index: QuantizedIndex, row: number): Float32Array {
  const out = new Float32Array(index.dims);
  const offset = row * index.dims;
  for (let i = 0; i < index.dims; i++) out[i] = index.values[offset + i] * index.scales[row];
  return out;
}

export function topK(
  index: QuantizedIndex,
  query: ArrayLike<number>,
  k: number,
  allow: (row: number) => boolean = () => true,
): { row: number; score: number }[] {
  if (query.length !== index.dims) throw new Error(`query has ${query.length} dims, expected ${index.dims}`);
  const q = l2Normalize(query);
  const hits: { row: number; score: number }[] = [];
  for (let r = 0; r < index.count; r++) {
    if (!allow(r)) continue;
    let dot = 0;
    const offset = r * index.dims;
    for (let i = 0; i < index.dims; i++) dot += index.values[offset + i] * q[i];
    hits.push({ row: r, score: dot * index.scales[r] });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}
