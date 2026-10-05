import { DefaultChatTransport, type LanguageModel, readUIMessageStream } from "ai";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { createTools, getToolDeps } from "@/lib/agent/tools";
import type { ToolDeps } from "@/lib/agent/tools/deps";
import { type ChatDeps, handleChat } from "@/lib/chat/handler";
import { createSheetSearch, loadSheetArtifacts } from "@/lib/data/sheets";
import { createMemoryGuardLimits, DEFAULT_GUARD_CONFIG } from "@/lib/guard/rate-limit";
import { parseChatError } from "@/lib/ui/chat-error";
import type { Scenario } from "./scenarios";
import type { TurnLog } from "./score";

export interface TurnRecord {
  /** The conversation up to and including this turn's assistant message. */
  messages: CoronaUIMessage[];
  turnLog: TurnLog | null;
  error: string | null;
  /** How many sheet searches fell back to keyword search in this turn. */
  keywordFallbacks: number;
}

/** The real tools and catalog; in "keyword" mode the query embedder always fails, as when the embedding quota is gone. */
function toolDeps(mode: Scenario["mode"]): ToolDeps {
  const base = getToolDeps();
  if (mode === "semantic") return base;
  const { chunks, index } = loadSheetArtifacts();
  const embedQuery = async (): Promise<number[]> => {
    throw new Error("eval: keyword mode");
  };
  return { ...base, sheets: createSheetSearch({ chunks, index, embedQuery }) };
}

/** Runs the handler with generous limits: the eval runner paces itself against the real free-tier quota. */
function chatDeps(mode: Scenario["mode"], model: LanguageModel | undefined): ChatDeps {
  const deps = toolDeps(mode);
  const generous = { perIpPer10Min: 1_000, perIpPerDay: 1_000, globalDailyCap: 1_000, globalPerMinuteCap: 1_000 };
  return {
    model,
    getTools: () => createTools(deps),
    limits: createMemoryGuardLimits({ ...DEFAULT_GUARD_CONFIG, ...generous }),
    isBot: async () => false,
  };
}

/** Captures the handler's JSON log lines for the duration of one turn instead of printing them. */
async function withCapturedLogs<T>(run: () => Promise<T>): Promise<{ result: T; lines: Record<string, unknown>[] }> {
  const lines: Record<string, unknown>[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => {
    try {
      lines.push(JSON.parse(String(args[0])) as Record<string, unknown>);
    } catch {
      // Not one of our JSON lines (e.g. a library warning): ignore it.
    }
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  try {
    const result = await run();
    // The turn line is written as the stream closes; let pending callbacks settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { result, lines };
  } finally {
    Object.assign(console, original);
  }
}

let ids = 0;
const userMessage = (text: string): CoronaUIMessage => ({ id: `eval-u-${++ids}`, role: "user", parts: [{ type: "text", text }] });

/** One user turn through the real route handler, read back exactly as useChat would. */
export async function runTurn(history: CoronaUIMessage[], text: string, mode: Scenario["mode"], model?: LanguageModel): Promise<TurnRecord> {
  const deps = chatDeps(mode, model);
  const messages = [...history, userMessage(text)];
  const transport = new DefaultChatTransport<CoronaUIMessage>({
    api: "http://localhost/api/chat",
    fetch: async (input, init) => handleChat(new Request(input, init), deps),
  });
  let streamError: string | null = null;
  const { result, lines } = await withCapturedLogs(async () => {
    try {
      const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "eval", messageId: undefined, messages, abortSignal: undefined });
      let last: CoronaUIMessage | undefined;
      for await (const message of readUIMessageStream<CoronaUIMessage>({ stream, onError: (e) => (streamError = parseChatError(e).kind) })) last = message;
      return last ?? null;
    } catch (error) {
      streamError = parseChatError(error).kind;
      return null;
    }
  });
  const turnLine = lines.find((line) => line.event === "chat_turn");
  const turnLog: TurnLog | null = turnLine
    ? {
        outcome: String(turnLine.outcome),
        steps: Number(turnLine.steps ?? 0),
        durationMs: Number(turnLine.durationMs ?? 0),
        inputTokens: Number(turnLine.inputTokens ?? 0),
        outputTokens: Number(turnLine.outputTokens ?? 0),
      }
    : null;
  const assistant: CoronaUIMessage = result ?? { id: `eval-a-${++ids}`, role: "assistant", parts: [] };
  return {
    messages: [...messages, assistant],
    turnLog,
    error: streamError,
    keywordFallbacks: lines.filter((line) => line.event === "sheet_search_fallback").length,
  };
}
