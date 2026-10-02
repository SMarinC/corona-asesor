import type { CoronaUIMessage } from "@/lib/agent/agent";

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

export function toolPhase(part: CoronaToolPart): ToolPhase {
  if (part.state === "output-error" || part.state === "output-denied") return "error";
  if (part.state !== "output-available") return "running";
  const status = (part.output as { status?: string }).status;
  if (status === "needs_review") return "review";
  return status === "error" ? "error" : "done";
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
  if (phase === "review") return `${done}, con datos por revisar`;
  if (phase === "error") return `${running}: no se pudo completar`;
  return done;
}
