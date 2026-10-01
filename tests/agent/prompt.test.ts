import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { TOOL_NAMES } from "@/lib/agent/tools";

describe("system prompt", () => {
  it("is versioned", () => {
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("mentions every tool, so the workflow and the registry cannot drift apart", () => {
    for (const name of TOOL_NAMES) expect(SYSTEM_PROMPT, name).toContain(name);
  });

  it("states the grounding rules", () => {
    for (const rule of ["por caja", "10 %", "[c0170]", "Requiere revisión", "Nunca estimes", "solo estimes"]) {
      expect(SYSTEM_PROMPT, rule).toContain(rule);
    }
  });

  it("collects the joint width, passes the budget and covers unknown attributes and citation fields", () => {
    for (const rule of [
      "ancho de junta en mm",
      "nunca se asume",
      "en budget",
      "withinBudget",
      "difference",
      'lista "unknown"',
      "compatibilityCitationId",
      "jointCitationId",
      "citationIds",
      "error sin status",
    ]) {
      expect(SYSTEM_PROMPT, rule).toContain(rule);
    }
  });
});
