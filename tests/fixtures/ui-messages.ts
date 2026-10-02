import type { CoronaUIMessage } from "@/lib/agent/agent";
import { executeBuildQuote } from "@/lib/agent/tools/build-quote";
import { executeCheckCompatibility } from "@/lib/agent/tools/check-compatibility";
import { executeComputeMaterials } from "@/lib/agent/tools/compute-materials";
import { executeSearchSupplies } from "@/lib/agent/tools/search-supplies";
import { executeSearchTiles } from "@/lib/agent/tools/search-tiles";
import type { CoronaPart, CoronaToolPart, ToolName } from "@/lib/ui/tool-parts";
import { makeToolDeps } from "./tool-deps";

let ids = 0;

/** A finished (or running) tool part exactly as useChat holds it. */
export function toolPart(name: ToolName, input: unknown, output?: unknown): CoronaToolPart {
  const base = { type: `tool-${name}`, toolCallId: `call-${++ids}`, input };
  return (output === undefined ? { ...base, state: "input-available" } : { ...base, state: "output-available", output }) as CoronaToolPart;
}

export function errorPart(name: ToolName, input: unknown, errorText: string): CoronaToolPart {
  return { type: `tool-${name}`, toolCallId: `call-${++ids}`, state: "output-error", input, errorText } as CoronaToolPart;
}

export const userMessage = (text: string): CoronaUIMessage => ({ id: `u-${++ids}`, role: "user", parts: [{ type: "text", text }] });

export const assistantMessage = (parts: CoronaPart[]): CoronaUIMessage => ({ id: `a-${++ids}`, role: "assistant", parts });

export const BATHROOM_PROMPT =
  "Quiero enchapar el piso de un baño de 3 x 2 m. Es zona húmeda, interior, tráfico residencial normal, junta de 3 mm y tengo un presupuesto de 1.500.000 pesos.";

/**
 * The full bathroom flow, with every output produced by the real tools over the fixture catalog:
 * T1 floor tile, A1 adhesive, G1 grout, 3 × 2 m, 3 mm joint, $1.500.000 budget.
 */
export function bathroomConversation(options: { quoteLines?: { sku: string; quantity: number }[] } = {}): CoronaUIMessage[] {
  const deps = makeToolDeps();
  const tilesInput = { surface: "floor", environment: "indoor", wetArea: true } as const;
  const adhesiveInput = { kind: "adhesive", tileMaterial: "ceramic" } as const;
  const groutInput = { kind: "grout", jointWidthMm: 3 } as const;
  const materialsInput = { lengthM: 3, widthM: 2, tileSku: "T1", adhesiveSku: "A1", groutSku: "G1", jointWidthMm: 3 };
  const compatibilityInput = {
    tileSku: "T1", surface: "floor", environment: "indoor", wetArea: true, traffic: "medium", jointWidthMm: 3, adhesiveSku: "A1", groutSku: "G1",
  } as const;
  const materials = executeComputeMaterials(deps, materialsInput);
  if (materials.status !== "ok") throw new Error("fixture: computeMaterials should be ok");
  const { tile, adhesive, grout } = materials.data;
  const lines = options.quoteLines ?? [
    { sku: "T1", quantity: tile.boxes },
    { sku: "A1", quantity: adhesive!.bags },
    { sku: "G1", quantity: grout!.units },
  ];
  const quoteInput = { lines, budget: 1_500_000 };

  return [
    userMessage(BATHROOM_PROMPT),
    assistantMessage([
      { type: "step-start" },
      toolPart("searchTiles", tilesInput, executeSearchTiles(deps, tilesInput)),
      { type: "step-start" },
      toolPart("searchSupplies", adhesiveInput, executeSearchSupplies(deps, adhesiveInput)),
      toolPart("searchSupplies", groutInput, executeSearchSupplies(deps, groutInput)),
      { type: "step-start" },
      toolPart("computeMaterials", materialsInput, materials),
      { type: "step-start" },
      toolPart("checkCompatibility", compatibilityInput, executeCheckCompatibility(deps, compatibilityInput)),
      { type: "step-start" },
      toolPart("buildQuote", quoteInput, executeBuildQuote(deps, quoteInput)),
      { type: "step-start" },
      { type: "text", text: "El pegante sirve para cerámica [c0001] y la boquilla cubre juntas de 1 a 5 mm [c0002]. Total dentro del presupuesto.", state: "done" },
    ] as CoronaPart[]),
  ];
}
