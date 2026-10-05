import { DefaultChatTransport, readUIMessageStream } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { createTools, getToolDeps } from "@/lib/agent/tools";
import type { ToolDeps } from "@/lib/agent/tools/deps";
import { handleChat } from "@/lib/chat/handler";
import { createProductionChatDeps, scriptedModelEnabled } from "@/lib/chat/production";
import { createScriptedDemoModel, DEMO_SKUS } from "@/lib/chat/scripted-model";
import { createMemoryGuardLimits, DEFAULT_GUARD_CONFIG } from "@/lib/guard/rate-limit";
import { citationIdsIn } from "@/lib/ui/citations";
import { deriveProject } from "@/lib/ui/derive-project";
import { BATHROOM_PROMPT, userMessage } from "../fixtures/ui-messages";

afterEach(() => vi.restoreAllMocks());

/** Runs one turn through the real route handler and reads it back exactly as useChat would. */
async function runTurn(messages: CoronaUIMessage[]): Promise<CoronaUIMessage> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const deps = {
    model: createScriptedDemoModel({ delayMs: 0 }),
    // As in production: the handler hands buildQuote this conversation's quantity ledger.
    getTools: (extra: Pick<ToolDeps, "quantities">) => createTools({ ...getToolDeps(), ...extra }),
    limits: createMemoryGuardLimits(DEFAULT_GUARD_CONFIG),
    isBot: async () => false,
  };
  const transport = new DefaultChatTransport<CoronaUIMessage>({
    api: "http://localhost/api/chat",
    fetch: async (input, init) => handleChat(new Request(input, init), deps),
  });
  const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "c", messageId: undefined, messages, abortSignal: undefined });
  let last: CoronaUIMessage | undefined;
  for await (const message of readUIMessageStream<CoronaUIMessage>({ stream })) last = message;
  if (!last) throw new Error("no assistant message");
  return last;
}

describe("scripted demo turn through the real handler and tools", () => {
  it("streams the whole quote flow and the panel derives a consistent project", async () => {
    const user = userMessage(BATHROOM_PROMPT);
    const assistant = await runTurn([user]);
    const tools = assistant.parts.filter((p) => p.type.startsWith("tool-")).map((p) => p.type);
    expect(tools).toEqual([
      "tool-searchTiles",
      "tool-searchSupplies",
      "tool-searchSupplies",
      "tool-getProduct",
      "tool-computeMaterials",
      "tool-checkCompatibility",
      "tool-buildQuote",
    ]);

    const project = deriveProject([user, assistant]);
    expect(project.tile).toMatchObject({ sku: DEMO_SKUS.tile, formatMm: { length: 552, width: 552 } });
    expect(project.compatibility?.verdict).toBe("compatible");
    // The script's quantities must be exactly what computeMaterials returns for the real catalog.
    expect(project.quote?.lineChecks).toEqual({ [DEMO_SKUS.tile]: "computed", [DEMO_SKUS.adhesive]: "computed", [DEMO_SKUS.grout]: "computed" });
    expect(project.quote?.data).toMatchObject({ total: 330012, withinBudget: true });
    expect(project.review).toEqual([]);
    // The server-side guard saw the same-turn calculation, so the quote itself is clean.
    const quotePart = assistant.parts.find((p) => p.type === "tool-buildQuote") as { output: { status: string } };
    expect(quotePart.output.status).toBe("ok");

    // Every id the scripted answer cites was returned by a tool in this turn.
    const text = assistant.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
    const cited = [...text.matchAll(/\[(c\d{4})\]/g)].map((m) => m[1]);
    expect(cited).toEqual(["c0046", "c0084"]);
    const returned = assistant.parts.flatMap((p) => ("output" in p ? citationIdsIn(p.output) : []));
    for (const id of cited) expect(returned).toContain(id);
    expect(text).toContain("$330.012");

    // The prose is tied to the tool outputs: if the catalog or the maths change, this fails instead of lying.
    const { tile, adhesive, grout } = project.materials!;
    const es = (n: number) => String(n).replace(".", ",");
    expect(text).toContain(`${tile!.boxes} cajas, que cubren ${es(tile!.coveredM2)} m²`);
    expect(text).toContain(`${adhesive!.bags} bultos de ${es(adhesive!.bagKg)} kg`);
    expect(text).toContain(`${grout!.units} unidad de ${es(grout!.packageKg)} kg`);
  });

  it("is enabled only locally: never on Vercel previews or production", () => {
    expect(scriptedModelEnabled({ CORONA_SCRIPTED_MODEL: "1" })).toBe(true);
    expect(scriptedModelEnabled({ CORONA_SCRIPTED_MODEL: "1", VERCEL_ENV: "development" })).toBe(true);
    expect(scriptedModelEnabled({ CORONA_SCRIPTED_MODEL: "1", VERCEL_ENV: "preview" })).toBe(false);
    expect(scriptedModelEnabled({ CORONA_SCRIPTED_MODEL: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(scriptedModelEnabled({ VERCEL_ENV: "development" })).toBe(false);
    expect(scriptedModelEnabled({})).toBe(false);
  });

  it("only builds the script model when enabled", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await createProductionChatDeps({ CORONA_SCRIPTED_MODEL: "1" })).model).toBeDefined();
    expect((await createProductionChatDeps({ CORONA_SCRIPTED_MODEL: "1", VERCEL_ENV: "production" })).model).toBeUndefined();
  });
});
