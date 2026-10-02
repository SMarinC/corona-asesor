import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** Real catalog SKUs: Piso Soria Gris 55,2 × 55,2, PEGACOR® Cerámico Gris and CONCOLOR® Junta Estrecha 2 Kg Gris Claro. */
export const DEMO_SKUS = { tile: "555332501", adhesive: "901391501", grout: "993051511" } as const;

const PROJECT = { surface: "floor", environment: "indoor", wetArea: true } as const;

/** One scripted call per agent step: the same tool sequence a real bathroom quote takes. */
const STEPS: { toolName: string; input: unknown }[][] = [
  [{ toolName: "searchTiles", input: { ...PROJECT, color: "gris", limit: 4 } }],
  [
    { toolName: "searchSupplies", input: { kind: "adhesive", tileMaterial: "ceramic" } },
    { toolName: "searchSupplies", input: { kind: "grout", jointWidthMm: 3 } },
  ],
  [
    { toolName: "getProduct", input: { sku: DEMO_SKUS.tile } },
    {
      toolName: "computeMaterials",
      input: { lengthM: 3, widthM: 2, tileSku: DEMO_SKUS.tile, adhesiveSku: DEMO_SKUS.adhesive, groutSku: DEMO_SKUS.grout, jointWidthMm: 3 },
    },
  ],
  [
    {
      toolName: "checkCompatibility",
      input: { tileSku: DEMO_SKUS.tile, ...PROJECT, traffic: "medium", jointWidthMm: 3, adhesiveSku: DEMO_SKUS.adhesive, groutSku: DEMO_SKUS.grout },
    },
  ],
  [
    {
      toolName: "buildQuote",
      input: {
        lines: [
          { sku: DEMO_SKUS.tile, quantity: 4 },
          { sku: DEMO_SKUS.adhesive, quantity: 2 },
          { sku: DEMO_SKUS.grout, quantity: 1 },
        ],
        budget: 1_500_000,
        projectSummary: "Piso de baño interior de 3 × 2 m, zona húmeda, junta de 3 mm.",
      },
    },
  ],
];

export const DEMO_ANSWER =
  "Para el piso del baño de 3 × 2 m elegí el Piso Soria Gris 55,2 × 55,2: está indicado para zonas húmedas y tráfico residencial.\n\n" +
  "- **Revestimiento:** 4 cajas, que cubren 7,28 m² con el 10 % de desperdicio.\n" +
  "- **Pegante:** PEGACOR® Cerámico Gris, 2 bultos de 25 kg. Sirve para cerámica en pisos y paredes, interiores y exteriores [c0046].\n" +
  "- **Boquilla:** CONCOLOR® Junta Estrecha Gris Claro, 1 unidad de 2 kg. Cubre juntas de 1 a 5 mm [c0084].\n\n" +
  "La combinación es compatible y el total es $330.012, dentro de tu presupuesto de $1.500.000.\n\n" +
  "_Respuesta guionada para desarrollo local: no usa el modelo._";

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

let callIds = 0;

function stream(chunks: StreamPart[], delayMs: number): StreamResult {
  return { stream: simulateReadableStream({ chunks, initialDelayInMs: delayMs, chunkDelayInMs: Math.round(delayMs / 15) }) };
}

/**
 * A model that replays a full bathroom quote against the real tools and catalog, so the UI can be built and
 * demoed without spending free-tier quota. Never used in production (see lib/chat/production.ts).
 */
export function createScriptedDemoModel({ delayMs = 700 }: { delayMs?: number } = {}): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async (options) => {
      // The step is how many model turns already happened since the user's last message.
      const lastUser = options.prompt.findLastIndex((message) => message.role === "user");
      const step = STEPS[options.prompt.slice(lastUser + 1).filter((message) => message.role === "assistant").length];
      if (step) {
        return stream(
          [
            { type: "stream-start", warnings: [] },
            ...step.map((c): StreamPart => ({ type: "tool-call", toolCallId: `demo-${++callIds}`, toolName: c.toolName, input: JSON.stringify(c.input) })),
            { type: "finish", finishReason: { unified: "tool-calls", raw: "STOP" }, usage },
          ],
          delayMs,
        );
      }
      const words = DEMO_ANSWER.split(/(?<= )/);
      return stream(
        [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "demo-text" },
          ...words.map((delta): StreamPart => ({ type: "text-delta", id: "demo-text", delta })),
          { type: "text-end", id: "demo-text" },
          { type: "finish", finishReason: { unified: "stop", raw: "STOP" }, usage },
        ],
        delayMs,
      );
    },
  });
}
