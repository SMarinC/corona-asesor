import type { CoronaTools } from "./tools";

/**
 * Where the purchase is, derived from what earlier assistant turns already proposed, never from the current turn.
 * The handler hands the agent only that stage's tools, so the model cannot skip ahead within one turn (quoting on
 * the first message, or picking the supplies itself) however the customer phrases the request. The prompt describes
 * only that stage's step (see ./prompt), so the model knows which step it is in.
 *
 * Known limitation: the client trims the history (last 20 messages, 64 KB). If the turn that proposed the tiles is
 * trimmed out, the stage falls back to explore. That costs the agent a re-search, never a wrong quote.
 */
export type Stage = "explore" | "supplies" | "quote";

type ToolName = keyof CoronaTools & string;

const EXPLORE: ToolName[] = ["searchTiles", "getProduct", "getCompanyInfo", "searchTechnicalSheets"];
const SUPPLIES: ToolName[] = [...EXPLORE, "searchSupplies", "checkCompatibility"];

/** Each stage keeps the earlier stages' tools, so the customer can always go back and change a decision. */
export const STAGE_TOOLS: Record<Stage, readonly ToolName[]> = {
  explore: EXPLORE,
  supplies: SUPPLIES,
  quote: [...SUPPLIES, "computeMaterials", "buildQuote"],
};

/**
 * The errorText of a call to a tool outside the stage: the gate rejected it before it ran. It is the gate working,
 * not a failure, so the UI hides it and the evals count it on its own.
 */
export const TOOL_UNAVAILABLE = "tool_unavailable";

interface PartLike {
  type: string;
  state?: string;
  output?: unknown;
}

type Output = { status?: string; data?: { results?: unknown[]; product?: { kind?: string } } } | undefined;

/** What a finished call put in front of the customer: tiles (search results or a tile by SKU), supplies, or nothing. */
function proposal(part: PartLike): "tiles" | "supplies" | null {
  if (part.state !== "output-available") return null;
  const output = part.output as Output;
  if (!output || output.status === "error") return null;
  const found = (output.data?.results?.length ?? 0) > 0;
  if (part.type === "tool-searchTiles" && found) return "tiles";
  if (part.type === "tool-getProduct" && output.data?.product?.kind === "tile") return "tiles";
  if (part.type === "tool-searchSupplies" && found) return "supplies";
  return null;
}

/** The stage for the turn about to run: pass the conversation before it (the new user message may be included). */
export function stageFromHistory(messages: readonly { role: string; parts: readonly PartLike[] }[]): Stage {
  const proposed = new Set(messages.flatMap((m) => (m.role === "assistant" ? m.parts.map(proposal) : [])));
  if (proposed.has("supplies")) return "quote";
  return proposed.has("tiles") ? "supplies" : "explore";
}
