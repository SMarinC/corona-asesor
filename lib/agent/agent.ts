import { google } from "@ai-sdk/google";
import { type InferAgentUIMessage, isStepCount, type LanguageModel, ToolLoopAgent } from "ai";
import { SYSTEM_PROMPT } from "./prompt";
import { type Stage, STAGE_TOOLS } from "./stage";
import type { CoronaTools } from "./tools";

export const MODEL_ID = "gemini-3.5-flash-lite";
/** Hard cap per turn; a typical quote should need ≤ 7 steps (spec success criterion). */
export const MAX_STEPS = 10;
export const MAX_OUTPUT_TOKENS = 2_048;

export interface ToolCallLog {
  tool: string;
  ms: number;
  status: string;
}

export interface StepLog {
  step: number;
  ms: number;
  toolCalls: string[];
  finishReason: string;
}

export interface TurnSummary {
  steps: number;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  hitStepCap: boolean;
}

export interface AgentHooks {
  /** Awaited before each model call (one per step), e.g. to charge it to the global quota. */
  onModelCall?: (stepNumber: number) => Promise<void> | void;
  onTool?: (entry: ToolCallLog) => void;
  onStep?: (entry: StepLog) => void;
  onFinish?: (summary: TurnSummary) => void;
}

/** The `status` of our ToolResult, or `tool_error` for a tool-error output (e.g. execute threw). */
export function toolStatus(toolOutput: unknown): string {
  const out = toolOutput as { type?: unknown; output?: { status?: unknown } } | null;
  if (out?.type === "tool-error") return "tool_error";
  const status = typeof out?.output === "object" && out.output !== null ? out.output.status : undefined;
  return typeof status === "string" ? status : "unknown";
}

/** Build one agent per request: hooks, step timing and the stage belong to a single turn. */
export function createCoronaAgent({
  tools,
  stage,
  model = google(MODEL_ID),
  hooks = {},
}: {
  tools: CoronaTools;
  /** The purchase stage the earlier turns reached (see ./stage): only its tools are active in this turn. */
  stage: Stage;
  model?: LanguageModel;
  hooks?: AgentHooks;
}) {
  let stepStartedAt = Date.now();
  // Calls already reported through onToolExecutionEnd; onStepEnd reports only the rest.
  const reportedCalls = new Set<string>();
  // streamText's default onError console.errors the raw error; for an APICallError that dumps requestBodyValues
  // (system prompt, tools and the user's conversation) into the server logs. Errors are handled instead by
  // createAgentUIStreamResponse's onError, which logs a sanitized code through the turn logger.
  // `onError` is forwarded to streamText but is missing from ToolLoopAgentSettings, hence the cast.
  const silenceSdkErrorDump = { onError: () => {} } as unknown as Record<string, never>;
  return new ToolLoopAgent({
    ...silenceSdkErrorDump,
    model,
    instructions: SYSTEM_PROMPT,
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // One retry for transient failures; hammering a 429 only burns free-tier quota.
    maxRetries: 1,
    // Every step gets only the stage's tools: a call to any other is rejected (NoSuchToolError) and never runs.
    // On the last allowed step tools are disabled too, so the turn always ends with an answer.
    prepareStep: ({ stepNumber }) => ({
      activeTools: STAGE_TOOLS[stage],
      ...(stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" as const } : {}),
    }),
    // The SDK awaits this right before the step's model call; it fires once per step, not again on a retry.
    onStepStart: async ({ stepNumber }) => {
      await hooks.onModelCall?.(stepNumber);
      stepStartedAt = Date.now();
    },
    onToolExecutionEnd: (event) => {
      reportedCalls.add(event.toolCall.toolCallId);
      hooks.onTool?.({ tool: event.toolCall.toolName, ms: event.toolExecutionMs, status: toolStatus(event.toolOutput) });
    },
    onStepEnd: (step) => {
      // Calls the SDK rejects before execution (invalid input, unknown tool) never reach onToolExecutionEnd.
      for (const part of step.content) {
        if (part.type === "tool-error" && !reportedCalls.has(part.toolCallId)) {
          reportedCalls.add(part.toolCallId);
          hooks.onTool?.({ tool: part.toolName, ms: 0, status: "tool_error" });
        }
      }
      hooks.onStep?.({
        step: step.stepNumber,
        ms: Date.now() - stepStartedAt,
        toolCalls: step.toolCalls.map((call) => call.toolName),
        finishReason: step.finishReason,
      });
    },
    onEnd: (event) => {
      hooks.onFinish?.({
        steps: event.steps.length,
        finishReason: event.finishReason,
        inputTokens: event.totalUsage.inputTokens ?? 0,
        outputTokens: event.totalUsage.outputTokens ?? 0,
        hitStepCap: event.steps.length >= MAX_STEPS,
      });
    },
  });
}

export type CoronaAgent = ReturnType<typeof createCoronaAgent>;
export type CoronaUIMessage = InferAgentUIMessage<CoronaAgent>;
