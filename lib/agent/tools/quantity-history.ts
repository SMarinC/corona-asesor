import type { CalcQuantities, QuantityLedger } from "@/lib/domain/quantity-check";

interface PartLike {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

/**
 * Replays the computeMaterials and buildQuote results already in the conversation, so this turn's quote is checked
 * the same way the panel checks it. The history comes from the client: a forged one can only mislabel that
 * visitor's own quote (prices still come from the catalog). The client trims it (last 20 messages, 64 KB), so a
 * calculation may be missing: the quote is then flagged for review (never refused), the safe direction.
 */
export function seedQuantityLedger(ledger: QuantityLedger, messages: readonly { role: string; parts: readonly PartLike[] }[]): void {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.state !== "output-available") continue;
      const output = part.output as { status?: string; data?: CalcQuantities } | undefined;
      if (!output || output.status === "error") continue;
      if (part.type === "tool-computeMaterials") {
        const tileSku = (part.input as { tileSku?: unknown } | undefined)?.tileSku;
        if (typeof tileSku === "string" && output.data) ledger.recordCalculation(tileSku, output.data);
      } else if (part.type === "tool-buildQuote") {
        ledger.takeForQuote();
      }
    }
  }
}
