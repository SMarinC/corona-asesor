/**
 * One real embedding call (`npm run evals:embedding`): checks that Gemini accepts the query-side options the app
 * uses (taskType RETRIEVAL_QUERY, outputDimensionality 768) and that the query lands near the right fragment of
 * the int8 index, which was built with RETRIEVAL_DOCUMENT.
 */
import { createGeminiEmbedQuery } from "@/lib/data/embed-query";
import { loadSheetArtifacts } from "@/lib/data/sheets";
import { EMBEDDING_DIMENSIONS, topK } from "@/lib/data/vector";

const QUERY = "¿Cuántos metros cuadrados trae cada caja de la pared Ticino blanco?";
const EXPECTED = "c0170";
const SKU = "257049001";

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set (npm run evals:embedding loads .env.local).");
  process.exit(1);
}

const { chunks, index } = loadSheetArtifacts();
const vector = await createGeminiEmbedQuery()(QUERY);
const norm = Math.sqrt(vector.reduce((n, v) => n + v * v, 0));
const hits = topK(index, vector, 3, (row) => chunks[row].skus.includes(SKU)).map(({ row, score }) => ({ id: chunks[row].citationId, score: score.toFixed(3) }));

console.log(JSON.stringify({ dimensions: vector.length, norm: norm.toFixed(3), hits }, null, 2));
const ok = vector.length === EMBEDDING_DIMENSIONS && hits.some((h) => h.id === EXPECTED);
console.log(ok ? `OK: ${EMBEDDING_DIMENSIONS} dimensions and ${EXPECTED} in the top 3.` : "FAIL: see the output above.");
process.exit(ok ? 0 : 1);
