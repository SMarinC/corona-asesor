import type { Tool } from "ai";

/** Calls a tool's execute like the agent loop does, minus the SDK's input validation. */
export async function callTool<T>(target: Tool, input: unknown): Promise<T> {
  if (!target.execute) throw new Error("tool has no execute function");
  return (await target.execute(input as never, { toolCallId: "test-call", messages: [], context: undefined as never })) as T;
}
