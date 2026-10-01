import { statSync, writeFileSync } from "node:fs";
import { curate } from "@/lib/domain/curation";
import { readChunks, readProducts } from "./lib/source";

const SOURCE_DIR = "data/source";

const rawProducts = await readProducts(`${SOURCE_DIR}/corona.duckdb`);
const rawChunks = readChunks(`${SOURCE_DIR}/chroma/chroma.sqlite3`);
const { products, chunks, report } = curate(rawProducts, rawChunks);

writeFileSync("data/catalog.json", JSON.stringify(products));
writeFileSync("data/sheets.json", JSON.stringify(chunks));
console.table(report);

const MAX_COMBINED_BYTES = 2.8 * 1024 * 1024;
const catalogBytes = statSync("data/catalog.json").size;
const sheetsBytes = statSync("data/sheets.json").size;
const combined = catalogBytes + sheetsBytes;
console.log(`catalog.json ${catalogBytes} B + sheets.json ${sheetsBytes} B = ${combined} B (${(combined / 1024 / 1024).toFixed(2)} MB)`);
if (combined > MAX_COMBINED_BYTES) {
  throw new Error(
    `Artifacts too large: catalog.json ${catalogBytes} B + sheets.json ${sheetsBytes} B = ${combined} B exceeds ${MAX_COMBINED_BYTES} B (2.8 MB).`,
  );
}
