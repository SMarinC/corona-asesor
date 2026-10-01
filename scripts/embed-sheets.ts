import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { google } from "@ai-sdk/google";
import { embedMany } from "ai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, encodeIndex } from "@/lib/data/vector";
import type { Product, SheetChunk } from "@/lib/domain/types";

const BATCH_SIZE = 50;
const PAUSE_MS = 4_000;
const MAX_ATTEMPTS = 6;
const CHECKPOINT = "data/source/embeddings.partial.json";

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing. Add it to .env.local (see .env.example).");
}

const sheets: SheetChunk[] = JSON.parse(readFileSync("data/sheets.json", "utf8"));
const catalog: Product[] = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const done: number[][] = existsSync(CHECKPOINT) ? JSON.parse(readFileSync(CHECKPOINT, "utf8")) : [];

async function embedBatch(values: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { embeddings } = await embedMany({
        model: google.embedding(EMBEDDING_MODEL),
        values,
        maxRetries: 0,
        providerOptions: {
          google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
        },
      });
      return embeddings;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      const wait = 10_000 * 2 ** (attempt - 1);
      console.warn(`batch failed (attempt ${attempt}), retrying in ${wait / 1000}s:`, (error as Error).message);
      await sleep(wait);
    }
  }
}

for (let start = done.length; start < sheets.length; start += BATCH_SIZE) {
  const batch = sheets.slice(start, start + BATCH_SIZE).map((c) => `${c.section}\n${c.text}`);
  done.push(...(await embedBatch(batch)));
  writeFileSync(CHECKPOINT, JSON.stringify(done));
  console.log(`embedded ${done.length}/${sheets.length}`);
  if (done.length < sheets.length) await sleep(PAUSE_MS);
}

writeFileSync("data/sheets.index.bin", encodeIndex(done, EMBEDDING_DIMENSIONS));
writeFileSync(
  "data/manifest.json",
  `${JSON.stringify(
    {
      embeddingModel: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      chunks: sheets.length,
      products: catalog.length,
      builtAt: new Date().toISOString().slice(0, 10),
      source: "Preprocessed snapshot of a scrape of Corona Colombia's public catalog (AgentSprint by ReshapeX).",
    },
    null,
    2,
  )}\n`,
);
console.log("wrote data/sheets.index.bin and data/manifest.json");
