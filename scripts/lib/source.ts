import { DatabaseSync } from "node:sqlite";
import { DuckDBInstance } from "@duckdb/node-api";
import type { RawChunk, RawProduct } from "@/lib/domain/types";

export async function readProducts(duckdbPath: string): Promise<RawProduct[]> {
  const instance = await DuckDBInstance.create(duckdbPath, { access_mode: "READ_ONLY" });
  const connection = await instance.connect();
  try {
    const reader = await connection.runAndReadAll(`
      SELECT sku, url, name, description, category, subcategory, price, is_in_stock, is_variant,
             CAST(images AS VARCHAR) AS images,
             CAST(specifications AS VARCHAR) AS specifications,
             CAST(specs_pdf AS VARCHAR) AS specs_pdf,
             ficha_tecnica_url
      FROM products
      ORDER BY sku`);
    return reader.getRowObjectsJson() as unknown as RawProduct[];
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

export function readChunks(sqlitePath: string): RawChunk[] {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    return db
      .prepare(`
        SELECT
          MAX(CASE WHEN m.key = 'sku' THEN m.string_value END)             AS sku,
          MAX(CASE WHEN m.key = 'pdf_id' THEN m.string_value END)          AS pdfId,
          MAX(CASE WHEN m.key = 'section' THEN m.string_value END)         AS section,
          MAX(CASE WHEN m.key = 'template' THEN m.string_value END)        AS template,
          MAX(CASE WHEN m.key = 'chroma:document' THEN m.string_value END) AS text
        FROM embeddings e
        JOIN embedding_metadata m ON m.id = e.id
        GROUP BY e.id
        ORDER BY e.id`)
      .all() as unknown as RawChunk[];
  } finally {
    db.close();
  }
}
