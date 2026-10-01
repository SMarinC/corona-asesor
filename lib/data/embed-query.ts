import { google } from "@ai-sdk/google";
import { embed, type EmbeddingModel } from "ai";
import type { EmbedQuery } from "./sheets";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./vector";

export const QUERY_EMBED_TIMEOUT_MS = 4_000;

/**
 * Query-side embedder. Free-tier quota is shared with chat, so there are no retries:
 * a 429 or a slow call falls back to keyword search immediately (see createSheetSearch).
 */
export function createGeminiEmbedQuery(model: EmbeddingModel = google.embedding(EMBEDDING_MODEL)): EmbedQuery {
  return async (query) => {
    const { embedding } = await embed({
      model,
      value: query,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(QUERY_EMBED_TIMEOUT_MS),
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY" } },
    });
    return embedding;
  };
}
