import { describe, expect, it } from "vitest";
import { createTools, getToolDeps, TOOL_NAMES } from "@/lib/agent/tools";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

describe("tool registry", () => {
  it("exposes exactly the 8 tools, each with a real description", () => {
    const tools = createTools(makeToolDeps());
    expect(Object.keys(tools).sort()).toEqual([...TOOL_NAMES].sort());
    for (const [name, t] of Object.entries(tools)) expect(String(t.description).length, name).toBeGreaterThan(60);
  });

  it("loads the real artifacts without calling the network", () => {
    const deps = getToolDeps();
    expect(deps.catalog.all).toHaveLength(336);
    expect(deps.sheets.getChunk("c0001")).toBeDefined();
    expect(deps.company.empresa).toBeDefined();
  });
});
