import { describe, expect, it } from "vitest";
import { buildTrace, createTimingStore, turnDuration } from "@/lib/ui/trace";
import type { CoronaPart } from "@/lib/ui/tool-parts";
import { assistantMessage, bathroomConversation, toolPart, userMessage } from "../fixtures/ui-messages";

describe("buildTrace", () => {
  it("groups tool calls by agent step and marks the answer step", () => {
    const [, assistant] = bathroomConversation();
    const steps = buildTrace(assistant, undefined);
    expect(steps.map((s) => s.tools.map((t) => t.name))).toEqual([
      ["searchTiles"],
      ["searchSupplies", "searchSupplies"],
      ["computeMaterials"],
      ["checkCompatibility"],
      ["buildQuote"],
      [],
    ]);
    expect(steps[1].tools.map((t) => t.label)).toEqual(["Pegantes encontrados", "Boquillas encontradas"]);
    expect(steps.at(-1)?.wroteText).toBe(true);
    expect(steps.every((s) => s.durationMs === null)).toBe(true);
  });

  it("measures each step until the next one starts, and the last until the turn ends", () => {
    const [, assistant] = bathroomConversation();
    const steps = buildTrace(assistant, { stepStarts: [0, 900, 1700, 2500, 3200, 4000], endedAt: 5200 });
    expect(steps.map((s) => s.durationMs)).toEqual([900, 800, 800, 700, 800, 1200]);
    expect(turnDuration({ stepStarts: [0, 900], endedAt: 5200 })).toBe(5200);
    expect(turnDuration({ stepStarts: [0], endedAt: null })).toBeNull();
  });
});

describe("buildTrace verdicts", () => {
  it("agrees with the cards: a compatibility verdict that is not compatible never shows as done", () => {
    const [, assistant] = bathroomConversation();
    for (const [verdict, label, phase] of [
      ["needs_review", "Compatibilidad: requiere revisión", "review"],
      ["incompatible", "Compatibilidad: incompatible", "error"],
    ] as const) {
      const parts = assistant.parts.map((part) => {
        if (part.type !== "tool-checkCompatibility" || part.state !== "output-available") return part;
        const output = part.output as { data: object };
        return { ...part, output: { ...output, data: { ...output.data, verdict } } };
      });
      const steps = buildTrace({ ...assistant, parts } as typeof assistant, undefined);
      const tool = steps.flatMap((s) => s.tools).find((t) => t.name === "checkCompatibility");
      expect(tool).toMatchObject({ label, phase });
    }
  });
});

describe("createTimingStore", () => {
  it("timestamps new steps as they stream in and closes the turn when streaming stops", () => {
    let clock = 1_000;
    const store = createTimingStore(() => clock);
    let notified = 0;
    store.subscribe(() => notified++);

    const user = userMessage("hola");
    const first = assistantMessage([{ type: "step-start" }, toolPart("searchTiles", {})]);
    store.observe([user, first], true);
    expect(store.getSnapshot()[first.id]).toEqual({ stepStarts: [1_000], endedAt: null });

    clock = 1_800;
    const grown = { ...first, parts: [...first.parts, { type: "step-start" as const }] };
    store.observe([user, grown], true);
    store.observe([user, grown], true);
    expect(store.getSnapshot()[first.id]).toEqual({ stepStarts: [1_000, 1_800], endedAt: null });

    clock = 2_500;
    store.observe([user, grown], false);
    expect(store.getSnapshot()[first.id]).toEqual({ stepStarts: [1_000, 1_800], endedAt: 2_500 });
    expect(notified).toBe(3);

    store.reset();
    expect(store.getSnapshot()).toEqual({});
  });

  it("gives no timing to messages never observed while streaming", () => {
    const store = createTimingStore(() => 5_000);
    let notified = 0;
    store.subscribe(() => notified++);
    const [user, restored] = bathroomConversation();
    store.observe([user, restored], false);
    expect(store.getSnapshot()).toEqual({});
    expect(notified).toBe(0);
    expect(buildTrace(restored, store.getSnapshot()[restored.id]).every((s) => s.durationMs === null)).toBe(true);
  });
});

describe("buildTrace with a streaming tool part", () => {
  it("shows a part whose input is still streaming as running", () => {
    const streaming = { type: "tool-searchSupplies", toolCallId: "t1", state: "input-streaming", input: undefined } as unknown as CoronaPart;
    const steps = buildTrace(assistantMessage([{ type: "step-start" }, streaming]), undefined);
    expect(steps).toHaveLength(1);
    expect(steps[0].tools).toEqual([{ toolCallId: "t1", name: "searchSupplies", label: "Buscando insumos", phase: "running" }]);
    expect(steps[0].wroteText).toBe(false);
  });
});
