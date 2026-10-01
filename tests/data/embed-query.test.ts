import { APICallError } from "ai";
import { MockEmbeddingModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createGeminiEmbedQuery } from "@/lib/data/embed-query";

describe("createGeminiEmbedQuery", () => {
  it("embeds the query as a retrieval query with the index's dimensions", async () => {
    const model = new MockEmbeddingModelV4({ doEmbed: { embeddings: [[0.1, 0.2, 0.3]], warnings: [] } });
    expect(await createGeminiEmbedQuery(model)("m2 por caja")).toEqual([0.1, 0.2, 0.3]);
    expect(model.doEmbedCalls[0].values).toEqual(["m2 por caja"]);
    expect(model.doEmbedCalls[0].providerOptions).toEqual({ google: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" } });
  });

  it("does not retry on quota errors, so search falls back to keywords at once", async () => {
    const model = new MockEmbeddingModelV4({
      doEmbed: async () => {
        throw new APICallError({ message: "Resource exhausted", url: "https://generativelanguage.googleapis.com", requestBodyValues: {}, statusCode: 429, isRetryable: true });
      },
    });
    await expect(createGeminiEmbedQuery(model)("hola")).rejects.toThrow();
    expect(model.doEmbedCalls).toHaveLength(1);
  });
});
