import { DefaultChatTransport, readUIMessageStream } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { createTools, getToolDeps } from "@/lib/agent/tools";
import type { ToolDeps } from "@/lib/agent/tools/deps";
import { handleChat } from "@/lib/chat/handler";
import { createProductionChatDeps, scriptedModelEnabled } from "@/lib/chat/production";
import { createScriptedDemoModel, DEMO_SKUS } from "@/lib/chat/scripted-model";
import { createMemoryGuardLimits, DEFAULT_GUARD_CONFIG } from "@/lib/guard/rate-limit";
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

describe("scripted demo through the real handler and tools", () => {
  it("walks the staged flow, one decision per turn, and the panel derives a consistent project", async () => {
    const tools = (m: CoronaUIMessage) => m.parts.filter((p) => p.type.startsWith("tool-")).map((p) => p.type);
    const text = (m: CoronaUIMessage) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
    const results = (m: CoronaUIMessage, type: string) =>
      m.parts.filter((p) => p.type === type).flatMap((p) => (p as { output: { data: { results: { name: string }[] } } }).output.data.results.map((r) => r.name));

    // Turn 1: the space is complete (joint and budget included), so the agent proposes tiles and lets the customer choose.
    const messages: CoronaUIMessage[] = [userMessage(BATHROOM_PROMPT)];
    const tile = await runTurn(messages);
    expect(tools(tile)).toEqual(["tool-searchTiles"]);
    const proposed = results(tile, "tool-searchTiles");
    expect(proposed).toHaveLength(3);
    for (const name of proposed) expect(text(tile)).toContain(name);
    expect(text(tile)).toContain("¿Cuál prefieres?");

    // Turn 2: adhesive and grout, verified with the confirmed joint.
    messages.push(tile, userMessage("Me quedo con el Piso Soria Gris."));
    const supplies = await runTurn(messages);
    expect(tools(supplies)).toEqual(["tool-searchSupplies", "tool-searchSupplies", "tool-checkCompatibility"]);
    const offered = results(supplies, "tool-searchSupplies");
    for (const name of ["PEGACOR® Cerámico Gris · 25 kg", "CONCOLOR® Junta Estrecha 2 Kg Gris Claro"]) {
      expect(offered).toContain(name);
      expect(text(supplies)).toContain(name);
    }

    // Turn 3: the quote, closed with the confirmation question.
    messages.push(supplies, userMessage("Sí, los confirmo."));
    const quote = await runTurn(messages);
    expect(tools(quote)).toEqual(["tool-computeMaterials", "tool-buildQuote"]);
    expect(text(quote)).toContain("¿Confirmas esta cotización o quieres cambiar algo?");
    messages.push(quote);

    const project = deriveProject(messages);
    expect(project.tile).toMatchObject({ sku: DEMO_SKUS.tile, formatMm: { length: 552, width: 552 } });
    expect(project.compatibility?.verdict).toBe("compatible");
    // The script's quantities must be exactly what computeMaterials returns for the real catalog.
    expect(project.quote?.lineChecks).toEqual({ [DEMO_SKUS.tile]: "computed", [DEMO_SKUS.adhesive]: "computed", [DEMO_SKUS.grout]: "computed" });
    expect(project.quote?.data).toMatchObject({ total: 330012, withinBudget: true });
    expect(project.review).toEqual([]);
    // The server-side guard saw the same-turn calculation, so the quote itself is clean.
    const quotePart = quote.parts.find((p) => p.type === "tool-buildQuote") as { output: { status: string } };
    expect(quotePart.output.status).toBe("ok");

    // The prose is tied to the tool outputs: if the catalog or the maths change, this fails instead of lying.
    const answer = text(quote);
    expect(answer).toContain("$330.012");
    const { tile: boxes, adhesive, grout } = project.materials!;
    const es = (n: number) => String(n).replace(".", ",");
    expect(answer).toContain(`${boxes!.boxes} cajas, que cubren ${es(boxes!.coveredM2)} m²`);
    expect(answer).toContain(`${adhesive!.bags} bultos de ${es(adhesive!.bagKg)} kg`);
    expect(answer).toContain(`${grout!.units} unidad de ${es(grout!.packageKg)} kg`);
    // Citations are chips from the tool outputs; the scripted prose writes no bracketed ids.
    for (const m of [tile, supplies, quote]) expect(text(m)).not.toMatch(/\[c\d{4}\]/);
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
