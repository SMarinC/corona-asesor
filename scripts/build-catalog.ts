import { writeFileSync } from "node:fs";
import { curate } from "@/lib/domain/curation";
import { readChunks, readProducts } from "./lib/source";

const SOURCE_DIR = "data/source";

const rawProducts = await readProducts(`${SOURCE_DIR}/corona.duckdb`);
const rawChunks = readChunks(`${SOURCE_DIR}/chroma/chroma.sqlite3`);
const { products, chunks, report } = curate(rawProducts, rawChunks);

writeFileSync("data/catalog.json", JSON.stringify(products));
writeFileSync("data/sheets.json", JSON.stringify(chunks));
console.table(report);
