import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** Real catalog SKUs: Piso Soria Gris 55,2 × 55,2, PEGACOR® Cerámico Gris and CONCOLOR® Junta Estrecha 2 Kg Gris Claro. */
export const DEMO_SKUS = { tile: "555332501", adhesive: "901391501", grout: "993051511" } as const;

const PROJECT = { surface: "floor", environment: "indoor", wetArea: true } as const;
const TILE = "Piso Soria Gris Caras Diferenciadas 55.2X55.2";
const ADHESIVE = "PEGACOR® Cerámico Gris";
const GROUT = "CONCOLOR® Junta Estrecha 2 Kg Gris Claro";
const NOTE = "\n\n_Respuesta guionada para desarrollo local: no usa el modelo._";

interface Call {
  toolName: string;
  input: unknown;
}

/** One user turn of the staged flow: the scripted calls of each agent step, then the answer. */
interface Turn {
  steps: Call[][];
  answer: string;
}

/** A bathroom floor quote, one decision per turn as the prompt asks: tile, then adhesive and grout, then the quote. */
const TURNS: Turn[] = [
  {
    steps: [[{ toolName: "searchTiles", input: { ...PROJECT, color: "gris", limit: 3 } }]],
    answer:
      "Espacio: piso de baño interior, zona húmeda, 3 × 2 m · Junta: 3 mm · Presupuesto: $1.500.000\n\n" +
      "Te propongo tres pisos grises para zona húmeda:\n" +
      `- ${TILE}\n- Piso Mikonos Ard Gris Caras Diferenciadas 33.8x33.8\n- Piso Lavra 2 Gris Cara Única 33.8x33.8\n\n` +
      "Las tarjetas muestran el precio por caja de cada uno. ¿Cuál prefieres?",
  },
  {
    steps: [
      [
        { toolName: "searchSupplies", input: { kind: "adhesive", tileMaterial: "ceramic", limit: 3 } },
        { toolName: "searchSupplies", input: { kind: "grout", jointWidthMm: 3, color: "gris", limit: 3 } },
      ],
      [
        {
          toolName: "checkCompatibility",
          input: { tileSku: DEMO_SKUS.tile, ...PROJECT, traffic: "medium", jointWidthMm: 3, adhesiveSku: DEMO_SKUS.adhesive, groutSku: DEMO_SKUS.grout },
        },
      ],
    ],
    answer:
      `Revestimiento: ${TILE} · Junta: 3 mm\n\n` +
      `Para este piso te propongo:\n- Pegante: ${ADHESIVE}, para cerámica en pisos y paredes.\n- Boquilla: ${GROUT}, para juntas de 1 a 5 mm.\n\n` +
      "La combinación es compatible con tu proyecto. ¿Los confirmas para calcular la cotización?",
  },
  {
    steps: [
      [
        {
          toolName: "computeMaterials",
          input: { lengthM: 3, widthM: 2, tileSku: DEMO_SKUS.tile, adhesiveSku: DEMO_SKUS.adhesive, groutSku: DEMO_SKUS.grout, jointWidthMm: 3 },
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
    ],
    answer:
      `Revestimiento: ${TILE} · Junta: 3 mm · Pegante: ${ADHESIVE} · Boquilla: ${GROUT}\n\n` +
      "- Revestimiento: 4 cajas, que cubren 7,28 m² con el 10 % de desperdicio.\n" +
      "- Pegante: 2 bultos de 25 kg.\n" +
      "- Boquilla: 1 unidad de 2 kg.\n\n" +
      "El total es $330.012, dentro de tu presupuesto de $1.500.000. No hay puntos por revisar.\n\n" +
      "¿Confirmas esta cotización o quieres cambiar algo?",
  },
];

const CLOSING = "Listo, la cotización queda confirmada. Si quieres cambiar algo, dime qué y lo retomamos desde esa etapa.";

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

let callIds = 0;

function stream(chunks: StreamPart[], delayMs: number): StreamResult {
  return { stream: simulateReadableStream({ chunks, initialDelayInMs: delayMs, chunkDelayInMs: Math.round(delayMs / 15) }) };
}

/**
 * A model that replays a staged bathroom quote against the real tools and catalog, so the UI can be built and
 * demoed without spending free-tier quota. Turn n plays stage n, whatever the user writes. Never used in
 * production (see lib/chat/production.ts).
 */
export function createScriptedDemoModel({ delayMs = 700 }: { delayMs?: number } = {}): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const turn: Turn | undefined = TURNS[options.prompt.filter((message) => message.role === "user").length - 1];
      // The step is how many model turns already happened since the user's last message.
      const lastUser = options.prompt.findLastIndex((message) => message.role === "user");
      const step = turn?.steps[options.prompt.slice(lastUser + 1).filter((message) => message.role === "assistant").length];
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
      const words = `${turn?.answer ?? CLOSING}${NOTE}`.split(/(?<= )/);
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
