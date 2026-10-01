import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
export type CallOptions = Parameters<MockLanguageModelV4["doStream"]>[0];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let callIds = 0;

export function textTurn(text: string): StreamResult {
  return {
    stream: convertArrayToReadableStream<StreamPart>([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: text },
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: "STOP" }, usage },
    ]),
  };
}

export function toolTurn(calls: { toolName: string; input: unknown }[]): StreamResult {
  return {
    stream: convertArrayToReadableStream<StreamPart>([
      { type: "stream-start", warnings: [] },
      ...calls.map((c): StreamPart => ({ type: "tool-call", toolCallId: `call-${++callIds}`, toolName: c.toolName, input: JSON.stringify(c.input) })),
      { type: "finish", finishReason: { unified: "tool-calls", raw: "STOP" }, usage },
    ]),
  };
}

/** A model that plays one scripted turn per agent step. */
export function scriptedModel(turns: StreamResult[] | ((options: CallOptions, call: number) => StreamResult)): MockLanguageModelV4 {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const index = call++;
      if (typeof turns === "function") return turns(options, index);
      const turn = turns[index];
      if (!turn) throw new Error(`scriptedModel has no turn ${index}`);
      return turn;
    },
  });
}
