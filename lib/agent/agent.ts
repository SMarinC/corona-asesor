import { google } from "@ai-sdk/google";
import { type InferAgentUIMessage, isStepCount, type LanguageModel, ToolLoopAgent } from "ai";
import { SYSTEM_PROMPT } from "./prompt";
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
  onTool?: (entry: ToolCallLog) => void;
  onStep?: (entry: StepLog) => void;
  onFinish?: (summary: TurnSummary) => void;
}

/** The `status` of our ToolResult, or `tool_error` when the SDK rejected the call (e.g. invalid input). */
export function toolStatus(toolOutput: unknown): string {
  const out = toolOutput as { type?: unknown; output?: { status?: unknown } } | null;
  if (out?.type === "tool-error") return "tool_error";
  const status = typeof out?.output === "object" && out.output !== null ? out.output.status : undefined;
  return typeof status === "string" ? status : "unknown";
}

/** Build one agent per request: hooks and step timing belong to a single turn. */
export function createCoronaAgent({
  tools,
  model = google(MODEL_ID),
  hooks = {},
}: {
  tools: CoronaTools;
  model?: LanguageModel;
  hooks?: AgentHooks;
}) {
  let stepStartedAt = Date.now();
  return new ToolLoopAgent({
    model,
    instructions: SYSTEM_PROMPT,
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // One retry for transient failures; hammering a 429 only burns free-tier quota.
    maxRetries: 1,
    // On the last allowed step tools are disabled, so the turn always ends with an answer.
    prepareStep: ({ stepNumber }) => {
      stepStartedAt = Date.now();
      return stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" } : {};
    },
    onToolExecutionEnd: (event) => {
      hooks.onTool?.({ tool: event.toolCall.toolName, ms: event.toolExecutionMs, status: toolStatus(event.toolOutput) });
    },
    onStepEnd: (step) => {
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
