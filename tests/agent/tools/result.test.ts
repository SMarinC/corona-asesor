import { describe, expect, it, vi } from "vitest";
import { needsReview, ok, runTool, toModelOutput, toolError, withoutImages } from "@/lib/agent/tools/result";

describe("runTool", () => {
  it("returns the tool's own result", async () => {
    expect(await runTool("t", () => ok({ n: 1 }))).toEqual({ status: "ok", data: { n: 1 } });
    expect(await runTool("t", () => needsReview<{ n: number }>({}, [{ field: "n", reason: "falta" }]))).toEqual({
      status: "needs_review",
      data: {},
      missing: [{ field: "n", reason: "falta" }],
    });
  });

  it("turns domain RangeErrors into invalid_input instead of throwing", async () => {
    const result = await runTool("computeMaterials", () => {
      throw new RangeError("lengthM must be a positive number, got 0");
    });
    expect(result).toEqual({ status: "error", code: "invalid_input", message: "lengthM must be a positive number, got 0" });
  });

  it("turns unexpected errors into a generic internal error and logs the details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runTool("searchTiles", async () => {
      throw new Error("disk exploded");
    });
    expect(result).toMatchObject({ status: "error", code: "internal" });
    expect(JSON.stringify(result)).not.toContain("disk exploded");
    expect(JSON.parse(String(spy.mock.calls[0][0]))).toMatchObject({ level: "error", event: "tool_failed", tool: "searchTiles", message: "disk exploded" });
    spy.mockRestore();
  });

  it("builds error results", () => {
    expect(toolError("unknown_sku", "No existe")).toEqual({ status: "error", code: "unknown_sku", message: "No existe" });
  });
});

describe("toModelOutput", () => {
  it("hides image URLs from the model and keeps everything else", () => {
    const output = { status: "ok", data: { results: [{ sku: "T1", imageUrl: "https://x/i.jpg", url: "https://corona.co/p/T1" }], product: { imageUrls: ["a"], sku: "T2" } } };
    expect(toModelOutput({ output })).toEqual({
      type: "json",
      value: { status: "ok", data: { results: [{ sku: "T1", url: "https://corona.co/p/T1" }], product: { sku: "T2" } } },
    });
  });

  it("leaves primitives and arrays of primitives alone", () => {
    expect(withoutImages([1, "a", null])).toEqual([1, "a", null]);
  });
});
