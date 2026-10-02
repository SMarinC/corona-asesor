import { describe, expect, it } from "vitest";
import { citationIdFromHref, citationIdsIn, linkCitations } from "@/lib/ui/citations";

describe("citationIdsIn", () => {
  it("collects every citation field the tools return, deduplicated in order", () => {
    const output = {
      status: "ok",
      data: {
        results: [
          { sku: "A1", compatibilityCitationId: "c0046" },
          { sku: "G1", jointCitationId: "c0084" },
          { sku: "G2", jointCitationId: null },
        ],
        checks: [{ rule: "Pegante ↔ material", citationId: "c0046" }],
        citationIds: ["c0084", "c0759"],
        adhesive: { citationIds: [] },
      },
    };
    expect(citationIdsIn(output)).toEqual(["c0046", "c0084", "c0759"]);
  });

  it("skips rejectedOverrides: those ids were written by the model, not returned by a tool", () => {
    const output = {
      status: "ok",
      data: {
        tile: { citationId: "c0046" },
        adhesive: { citationIds: ["c0084"] },
        rejectedOverrides: [{ field: "bagKg", citationId: "c9999", reason: "unknown_citation", message: "x" }],
      },
    };
    expect(citationIdsIn(output)).toEqual(["c0046", "c0084"]);
  });

  it("ignores ids under other keys and malformed ids", () => {
    expect(citationIdsIn({ sku: "c0001", note: "[c0002]", citationId: "x12", citationIds: ["c12"] })).toEqual([]);
  });
});

describe("linkCitations", () => {
  it("turns bracketed ids into chip links and leaves other brackets alone", () => {
    expect(linkCitations("Sirve para cerámica [c0046] y juntas de 1 a 5 mm [c0084].")).toBe(
      "Sirve para cerámica [c0046](#cita-c0046) y juntas de 1 a 5 mm [c0084](#cita-c0084).",
    );
    expect(linkCitations("[nota] y [c0046](#cita-c0046)")).toBe("[nota] y [c0046](#cita-c0046)");
  });

  it("reads the id back from the link", () => {
    expect(citationIdFromHref("#cita-c0084")).toBe("c0084");
    expect(citationIdFromHref("https://corona.co")).toBeNull();
    expect(citationIdFromHref(undefined)).toBeNull();
  });
});
