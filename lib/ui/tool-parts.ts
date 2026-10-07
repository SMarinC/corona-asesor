import type { CoronaUIMessage } from "@/lib/agent/agent";
import { TOOL_UNAVAILABLE } from "@/lib/agent/stage";

export type CoronaPart = CoronaUIMessage["parts"][number];
export type CoronaToolPart = Extract<CoronaPart, { type: `tool-${string}` }>;
export type ToolName = CoronaToolPart["type"] extends `tool-${infer Name}` ? Name : never;
export type ToolPartOf<N extends ToolName> = Extract<CoronaToolPart, { type: `tool-${N}` }>;
/** The tool's ToolResult as streamed to the client (image URLs included). */
export type ToolResultOf<N extends ToolName> = NonNullable<ToolPartOf<N>["output"]>;

/** Where a tool call is: running, finished ok, finished needing review, or failed. */
export type ToolPhase = "running" | "done" | "review" | "error";

export function isToolPart(part: CoronaPart): part is CoronaToolPart {
  return part.type.startsWith("tool-");
}

export const toolNameOf = (part: CoronaToolPart): ToolName => part.type.slice("tool-".length) as ToolName;

export function isToolPartOf<N extends ToolName>(part: CoronaPart, name: N): part is ToolPartOf<N> {
  return part.type === `tool-${name}`;
}

/** The output of a finished call, or null while it runs or when the SDK rejected it. */
export function toolResult<N extends ToolName>(part: ToolPartOf<N>): ToolResultOf<N> | null {
  return (part.state === "output-available" ? part.output : null) as ToolResultOf<N> | null;
}

/** The verdict of a finished checkCompatibility call, or null for any other call or while it runs. */
function compatibilityVerdict(part: CoronaToolPart): string | null {
  if (!isToolPartOf(part, "checkCompatibility") || part.state !== "output-available") return null;
  const output = part.output as { status?: string; data?: { verdict?: string } };
  return output.status === "ok" ? (output.data?.verdict ?? null) : null;
}

/**
 * Where a call is, as every consumer (cards, trace timeline) shows it. A finished compatibility check that is not
 * "compatible" must not read as a success: needs_review is "review" and incompatible is "error".
 */
export function toolPhase(part: CoronaToolPart): ToolPhase {
  if (part.state === "output-error" || part.state === "output-denied") return "error";
  if (part.state !== "output-available") return "running";
  const verdict = compatibilityVerdict(part);
  if (verdict === "needs_review") return "review";
  if (verdict === "incompatible") return "error";
  const status = (part.output as { status?: string }).status;
  if (status === "needs_review") return "review";
  return status === "error" ? "error" : "done";
}

/** A call the stage gate rejected: it never ran and nothing failed, so the work log and the trace leave it out. */
export function toolRejected(part: CoronaToolPart): boolean {
  return part.state === "output-error" && part.errorText === TOOL_UNAVAILABLE;
}

/** True when the call itself failed (SDK error or a tool error), as opposed to finishing with an incompatible verdict. */
export function toolFailed(part: CoronaToolPart): boolean {
  if (part.state === "output-error" || part.state === "output-denied") return true;
  return part.state === "output-available" && (part.output as { status?: string }).status === "error";
}

const RUNNING: Record<ToolName, string> = {
  searchTiles: "Buscando revestimientos",
  searchSupplies: "Buscando insumos",
  getProduct: "Consultando el producto",
  searchTechnicalSheets: "Leyendo fichas técnicas",
  computeMaterials: "Calculando materiales",
  checkCompatibility: "Verificando compatibilidad",
  buildQuote: "Armando la cotización",
  getCompanyInfo: "Consultando información de Corona",
};

const DONE: Record<ToolName, string> = {
  searchTiles: "Revestimientos encontrados",
  searchSupplies: "Insumos encontrados",
  getProduct: "Producto consultado",
  searchTechnicalSheets: "Fichas técnicas consultadas",
  computeMaterials: "Materiales calculados",
  checkCompatibility: "Compatibilidad verificada",
  buildQuote: "Cotización lista",
  getCompanyInfo: "Información de Corona",
};

/** Spanish label for a tool step. Supplies name what they look for once the input has arrived. */
export function toolLabel(part: CoronaToolPart): string {
  const name = toolNameOf(part);
  const phase = toolPhase(part);
  let running = RUNNING[name];
  let done = DONE[name];
  if (name === "searchSupplies") {
    const kind = (part.input as { kind?: string } | undefined)?.kind;
    if (kind === "adhesive") [running, done] = ["Buscando pegantes", "Pegantes encontrados"];
    if (kind === "grout") [running, done] = ["Buscando boquillas", "Boquillas encontradas"];
  }
  if (phase === "running") return running;
  const verdict = compatibilityVerdict(part);
  if (verdict === "needs_review") return "Compatibilidad: requiere revisión";
  if (verdict === "incompatible") return "Compatibilidad: incompatible";
  if (phase === "review") return `${done}, con datos por revisar`;
  if (phase === "error") return `${running}: no se pudo completar`;
  return done;
}
