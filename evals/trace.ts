import type { CoronaUIMessage } from "@/lib/agent/agent";
import { isToolPart, toolNameOf } from "@/lib/ui/tool-parts";

/** One tool call of a turn, compact enough to read by hand in results.json. */
export interface TraceStep {
  tool: string;
  status: "ok" | "needs_review" | "error" | "running";
  /** The tool error code, when the tool itself returned an error. */
  error?: string;
  input: unknown;
}

const MAX_STRING = 120;
const MAX_ITEMS = 12;
const MAX_DEPTH = 4;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

/** Strings are cut, arrays capped, and anything shaped like an IP address redacted: the tools take no secrets, but the file is committed. */
function compact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const clean = value.replace(IPV4, "[ip]");
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => compact(item, depth + 1));
    return value.length > MAX_ITEMS ? [...items, "…"] : items;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item, depth + 1)]));
}

export const answerOf = (message: CoronaUIMessage): string =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

/** The tool calls of one assistant message, in order: name, outcome and key inputs (SKUs, quantities, environment, traffic...). */
export function traceOf(message: CoronaUIMessage): TraceStep[] {
  return message.parts.flatMap((part): TraceStep[] => {
    if (!isToolPart(part)) return [];
    const tool = toolNameOf(part);
    const input = compact(part.input);
    if (part.state === "output-error" || part.state === "output-denied") return [{ tool, status: "error", input }];
    if (part.state !== "output-available") return [{ tool, status: "running", input }];
    const output = part.output as { status?: string; code?: string } | undefined;
    if (output?.status === "error") return [{ tool, status: "error", ...(output.code ? { error: output.code } : {}), input }];
    return [{ tool, status: output?.status === "needs_review" ? "needs_review" : "ok", input }];
  });
}
