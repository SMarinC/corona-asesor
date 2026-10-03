import type { CoronaUIMessage } from "@/lib/agent/agent";
import { isToolPart, toolNameOf } from "@/lib/ui/tool-parts";
import { assistantMessage, bathroomConversation } from "./ui-messages";

/** The bathroom flow followed by a second computeMaterials call: the quote no longer matches the latest numbers. */
export function laterRecalculation(): CoronaUIMessage[] {
  const conversation = bathroomConversation();
  const materials = conversation[1].parts.filter(isToolPart).find((part) => toolNameOf(part) === "computeMaterials");
  if (!materials) throw new Error("fixture: computeMaterials missing");
  return [...conversation, assistantMessage([{ type: "step-start" }, { ...materials, toolCallId: "later-materials" }])];
}

/** The bathroom flow where checkCompatibility ran on another tile than the one computeMaterials used. */
export function withCheckedTile(tile: { sku: string; name: string }): CoronaUIMessage[] {
  const conversation = bathroomConversation();
  const parts = conversation[1].parts.map((part) => {
    if (part.type !== "tool-checkCompatibility" || part.state !== "output-available") return part;
    const output = part.output as { data: { products: object } };
    return { ...part, output: { ...output, data: { ...output.data, products: { ...output.data.products, tile } } } };
  });
  return [conversation[0], { ...conversation[1], parts } as CoronaUIMessage];
}

/** The bathroom flow with the compatibility verdict replaced. */
export function withVerdict(verdict: "compatible" | "needs_review" | "incompatible"): CoronaUIMessage[] {
  const conversation = bathroomConversation();
  const parts = conversation[1].parts.map((part) => {
    if (part.type !== "tool-checkCompatibility" || part.state !== "output-available") return part;
    const output = part.output as { data: object };
    return { ...part, output: { ...output, data: { ...output.data, verdict } } };
  });
  return [conversation[0], { ...conversation[1], parts } as CoronaUIMessage];
}
