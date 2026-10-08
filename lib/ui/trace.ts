import type { CoronaUIMessage } from "@/lib/agent/agent";
import { type CoronaToolPart, isToolPart, type ToolPhase, toolLabel, toolNameOf, type ToolName, toolPhase, toolRejected } from "./tool-parts";

/** When each agent step of one assistant message became visible in this browser, and when the turn ended. */
export interface TurnTiming {
  stepStarts: number[];
  endedAt: number | null;
}

export type Timings = Record<string, TurnTiming>;

/**
 * Tools run in about a millisecond on the server; what the visitor waits for is each model step. The store
 * timestamps every step-start part the first time it appears and the moment the turn stops streaming. A turn and
 * its first step start when the request does: the wait before the first part (the guards and the model's first
 * response) is part of what the visitor waited for, and in production it can be most of the turn.
 */
export function createTimingStore(now: () => number = Date.now) {
  let timings: Timings = {};
  let wasStreaming = false;
  /** When the current request started: the moment streaming went from false to true. */
  let requestStart: number | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    observe(messages: CoronaUIMessage[], streaming: boolean) {
      if (streaming && !wasStreaming) requestStart = now();
      wasStreaming = streaming;
      let next: Timings | null = null;
      messages.forEach((message, index) => {
        if (message.role !== "assistant") return;
        const known = (next ?? timings)[message.id];
        const live = streaming && index === messages.length - 1;
        // Messages never seen while streaming (restored history, batched final update) get no timing.
        if (!known && !live) return;
        const current = known ?? { stepStarts: [], endedAt: null };
        const steps = message.parts.filter((part) => part.type === "step-start").length;
        if (current.stepStarts.length >= steps && (live || current.endedAt !== null)) return;
        const at = now();
        const stepStarts = [...current.stepStarts];
        // The live turn's first step began with the request, not when its first part arrived.
        while (stepStarts.length < steps) stepStarts.push(stepStarts.length === 0 && live && requestStart !== null ? requestStart : at);
        next = { ...(next ?? timings), [message.id]: { stepStarts, endedAt: live ? null : (current.endedAt ?? at) } };
      });
      if (next) {
        timings = next;
        emit();
      }
    },
    reset() {
      timings = {};
      requestStart = null;
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: (): Timings => timings,
  };
}

export type TimingStore = ReturnType<typeof createTimingStore>;

export interface TraceTool {
  toolCallId: string;
  name: ToolName;
  label: string;
  phase: ToolPhase;
}

export interface TraceStep {
  index: number;
  tools: TraceTool[];
  /** True when the step wrote the answer instead of (or after) calling tools. */
  wroteText: boolean;
  /** Null while the step is still running or when no timing was recorded. */
  durationMs: number | null;
}

/** One assistant message as a list of agent steps, for the trace timeline. */
export function buildTrace(message: CoronaUIMessage, timing: TurnTiming | undefined): TraceStep[] {
  const steps: TraceStep[] = [];
  for (const part of message.parts) {
    if (part.type === "step-start") {
      steps.push({ index: steps.length, tools: [], wroteText: false, durationMs: null });
      continue;
    }
    const step = steps.at(-1);
    if (!step) continue;
    if (isToolPart(part)) {
      const tool = part as CoronaToolPart;
      // A call the stage gate rejected never ran: it is not one of the step's tools.
      if (!toolRejected(tool)) step.tools.push({ toolCallId: tool.toolCallId, name: toolNameOf(tool), label: toolLabel(tool), phase: toolPhase(tool) });
    } else if (part.type === "text" && part.text.trim().length > 0) {
      step.wroteText = true;
    }
  }
  if (timing) {
    for (const step of steps) {
      const start = timing.stepStarts[step.index];
      const end = timing.stepStarts[step.index + 1] ?? timing.endedAt;
      step.durationMs = start !== undefined && end !== null && end !== undefined ? end - start : null;
    }
  }
  return steps;
}

/** Wall time of a finished turn: from its request (the first step's start) to the end of the stream. */
export function turnDuration(timing: TurnTiming | undefined): number | null {
  if (!timing || timing.endedAt === null || timing.stepStarts.length === 0) return null;
  return timing.endedAt - timing.stepStarts[0];
}
