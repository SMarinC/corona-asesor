import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { type AgentHooks, createCoronaAgent, MAX_STEPS, toolStatus } from "@/lib/agent/agent";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { type Stage, STAGE_TOOLS } from "@/lib/agent/stage";
import { createTools } from "@/lib/agent/tools";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";
import { scriptedModel, textTurn, toolTurn } from "@/tests/helpers/mock-model";

/** The quote stage has every tool, so these tests exercise the loop itself; the gate has its own tests. */
async function run(model: LanguageModel, hooks: AgentHooks = {}, stage: Stage = "quote") {
  const agent = createCoronaAgent({ tools: createTools(makeToolDeps()), stage, model, hooks });
  const result = await agent.stream({ prompt: "Necesito piso para un baño de 3 x 2 m" });
  await result.consumeStream();
  return { steps: await result.steps, text: await result.text };
}

const promptAfterSystem = (model: ReturnType<typeof scriptedModel>, call: number) => JSON.stringify(model.doStreamCalls[call].prompt.slice(1));

describe("Corona agent harness", () => {
  it("sends the prompt of its stage as instructions", async () => {
    const model = scriptedModel([textTurn("Hola")]);
    await run(model);
    expect(model.doStreamCalls[0].prompt[0]).toMatchObject({ role: "system", content: buildSystemPrompt("quote") });
  });

  it("runs a tool, feeds its result back and answers (multi-step loop)", async () => {
    const model = scriptedModel([
      toolTurn([{ toolName: "searchTiles", input: { surface: "floor", wetArea: true } }]),
      textTurn("Te recomiendo el Piso Prueba Blanco."),
    ]);
    const { steps, text } = await run(model);
    expect(steps).toHaveLength(2);
    expect(steps[0].toolResults[0].output).toMatchObject({ status: "ok" });
    expect(text).toBe("Te recomiendo el Piso Prueba Blanco.");
    expect(promptAfterSystem(model, 1)).toContain("Piso Prueba Blanco 60x60");
  });

  it("hides image URLs from the model", async () => {
    const model = scriptedModel([toolTurn([{ toolName: "searchTiles", input: { surface: "floor" } }]), textTurn("Listo.")]);
    await run(model);
    expect(promptAfterSystem(model, 1)).not.toContain("medias/T1.jpg");
  });

  it("returns tool errors to the model as data and keeps going", async () => {
    const model = scriptedModel([toolTurn([{ toolName: "getProduct", input: { sku: "ZZ9" } }]), textTurn("Ese SKU no existe.")]);
    const { steps } = await run(model);
    expect(steps).toHaveLength(2);
    expect(steps[0].toolResults[0].output).toMatchObject({ status: "error", code: "unknown_sku" });
    expect(promptAfterSystem(model, 1)).toContain("unknown_sku");
  });

  it("recovers from tool input that fails the schema", async () => {
    const model = scriptedModel([
      toolTurn([{ toolName: "computeMaterials", input: { lengthM: -3, widthM: 2, tileSku: "T1" } }]),
      textTurn("Necesito medidas válidas."),
    ]);
    const onTool = vi.fn();
    const { steps } = await run(model, { onTool });
    expect(steps).toHaveLength(2);
    expect(steps[0].content.some((part) => part.type === "tool-error")).toBe(true);
    expect(onTool).toHaveBeenCalledTimes(1);
    expect(onTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "computeMaterials", status: "tool_error" }));
  });

  it("disables tools on the last allowed step so the turn always ends with an answer, keeping the stage gate", async () => {
    const model = scriptedModel((options) =>
      options.toolChoice?.type === "none"
        ? textTurn("Resumen con lo que alcancé a verificar.")
        : toolTurn([{ toolName: "getProduct", input: { sku: "T1" } }]),
    );
    const { steps, text } = await run(model, {}, "explore");
    expect(steps).toHaveLength(MAX_STEPS);
    expect(model.doStreamCalls[0].toolChoice).toEqual({ type: "auto" });
    expect(model.doStreamCalls[MAX_STEPS - 1].toolChoice).toEqual({ type: "none" });
    const sentTools = (call: number) => (model.doStreamCalls[call].tools ?? []).map((t) => t.name).sort();
    for (const call of [0, MAX_STEPS - 1]) expect(sentTools(call)).toEqual([...STAGE_TOOLS.explore].sort());
    expect(text).toBe("Resumen con lo que alcancé a verificar.");
  });

  it("reports tools, steps and usage through hooks", async () => {
    const hooks = { onTool: vi.fn(), onStep: vi.fn(), onFinish: vi.fn() };
    await run(scriptedModel([toolTurn([{ toolName: "searchTiles", input: { surface: "floor" } }]), textTurn("Listo.")]), hooks);
    expect(hooks.onTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "searchTiles", status: "ok" }));
    expect(hooks.onStep).toHaveBeenCalledTimes(2);
    expect(hooks.onStep).toHaveBeenNthCalledWith(1, expect.objectContaining({ step: 0, toolCalls: ["searchTiles"], finishReason: "tool-calls" }));
    expect(hooks.onFinish).toHaveBeenCalledWith({ steps: 2, finishReason: "stop", inputTokens: 20, outputTokens: 10, hitStepCap: false });
  });

  it("awaits onModelCall before every model call, with its step number", async () => {
    const events: string[] = [];
    const turns = [toolTurn([{ toolName: "searchTiles", input: { surface: "floor" } }]), toolTurn([{ toolName: "getProduct", input: { sku: "T1" } }]), textTurn("Listo.")];
    const model = scriptedModel((_options, call) => {
      events.push(`model ${call}`);
      return turns[call];
    });
    const onModelCall = async (step: number) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`charge ${step}`);
    };
    const { steps } = await run(model, { onModelCall });
    expect(steps).toHaveLength(3);
    expect(events).toEqual(["charge 0", "model 0", "charge 1", "model 1", "charge 2", "model 2"]);
  });

  it("reads the status of tool results and SDK tool errors", () => {
    expect(toolStatus({ type: "tool-result", output: { status: "needs_review" } })).toBe("needs_review");
    expect(toolStatus({ type: "tool-error", error: "bad input" })).toBe("tool_error");
    expect(toolStatus({ type: "tool-result", output: "plain" })).toBe("unknown");
  });
});
