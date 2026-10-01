import type { JSONValue } from "ai";
import { errorMessage, log } from "@/lib/log";

export interface MissingField {
  field: string;
  /** Spanish; shown to the end user in the "Requiere revisión" card. */
  reason: string;
}

export type ToolErrorCode = "unknown_sku" | "wrong_kind" | "invalid_input" | "internal";

export interface ToolError {
  status: "error";
  code: ToolErrorCode;
  /** Spanish (or the domain's English RangeError text); read by the model. */
  message: string;
}

export type ToolResult<T> =
  | { status: "ok"; data: T }
  | { status: "needs_review"; data: Partial<T>; missing: MissingField[] }
  | ToolError;

export const ok = <T>(data: T): ToolResult<T> => ({ status: "ok", data });

export const needsReview = <T>(data: Partial<T>, missing: MissingField[]): ToolResult<T> => ({
  status: "needs_review",
  data,
  missing,
});

export const toolError = (code: ToolErrorCode, message: string): ToolError => ({ status: "error", code, message });

/**
 * Tools never throw into the agent loop: errors are data the model can react to.
 * Domain RangeErrors carry a precise message; anything else is logged and hidden.
 */
export async function runTool<T>(name: string, run: () => ToolResult<T> | Promise<ToolResult<T>>): Promise<ToolResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RangeError) return toolError("invalid_input", error.message);
    log("error", "tool_failed", { tool: name, message: errorMessage(error) });
    return toolError("internal", "Error interno al ejecutar la herramienta; intenta con otros datos o infórmalo al usuario.");
  }
}

const IMAGE_KEYS = new Set(["imageUrl", "imageUrls"]);

/** Image URLs are long CDN links the model never needs; the UI still receives them in the tool output. */
export function withoutImages(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutImages);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !IMAGE_KEYS.has(key))
        .map(([key, v]) => [key, withoutImages(v)]),
    );
  }
  return value;
}

export const toModelOutput = ({ output }: { output: unknown }): { type: "json"; value: JSONValue } => ({
  type: "json",
  value: withoutImages(output) as JSONValue,
});
