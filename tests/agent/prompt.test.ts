import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { TOOL_NAMES } from "@/lib/agent/tools";

const NL = String.fromCharCode(10);

describe("system prompt", () => {
  it("is versioned", () => {
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("mentions every tool, so the workflow and the registry cannot drift apart", () => {
    for (const name of TOOL_NAMES) expect(SYSTEM_PROMPT, name).toContain(name);
  });

  it("states the grounding rules", () => {
    for (const rule of ["por caja", "10 %", "[c9998]", "Requiere revisión", "Nunca estimes", "solo estimes"]) {
      expect(SYSTEM_PROMPT, rule).toContain(rule);
    }
  });

  it("asks for plain-text headings, without emojis or decorative headings, in one style line", () => {
    const line = "No uses emojis ni encabezados decorativos; usa títulos y viñetas en texto plano.";
    expect(SYSTEM_PROMPT).toContain(line);
    expect(SYSTEM_PROMPT.split(line)).toHaveLength(2);
    expect(SYSTEM_PROMPT.match(/No uses emojis/g)).toHaveLength(1);
    expect(PROMPT_VERSION).toBe("2026-10-03.1");
  });

  it("does not use real corpus ids in the citation example", () => {
    expect(SYSTEM_PROMPT).not.toContain("[c0170]");
    expect(SYSTEM_PROMPT).not.toContain("[c0171]");
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

  it("makes citations mandatory for specific claims, with a concrete example", () => {
    for (const rule of ["compatibilidad pegante↔material", "uso en exteriores", "rango de junta", "agrega su [cXXXX]", "citationIds"]) {
      expect(SYSTEM_PROMPT, rule).toContain(rule);
    }
  });

  it("checks the citations of checkCompatibility, searchSupplies and computeMaterials before closing", () => {
    const checklist = SYSTEM_PROMPT.split(NL).filter((line) => /^- .*cita/.test(line) && ["checkCompatibility", "searchSupplies", "computeMaterials"].every((t) => line.includes(t)));
    expect(checklist).toHaveLength(1);
  });

  it("looks up missing tile and adhesive data in the sheets and passes it as a cited override", () => {
    const step3 = SYSTEM_PROMPT.split(NL).find((line) => line.startsWith("3. "));
    for (const part of ["pegante", "m² por caja", "rendimiento", "peso del bulto", "searchTechnicalSheets", "overrides", "{ value, citationId }"]) {
      expect(step3, part).toContain(part);
    }
  });

  it("filters adhesives for exteriors and treats pricePerM2 as a reference only", () => {
    const step4 = SYSTEM_PROMPT.split(NL).find((line) => line.startsWith("4. "));
    expect(step4).toContain("outdoor: true");
    expect(SYSTEM_PROMPT).toContain("pricePerM2 es solo referencia; la cotización va por caja");
  });

  it("separates traffic from measurements in the data checklist", () => {
    expect(SYSTEM_PROMPT).toContain("alto), medidas");
  });

  it("never lets buildQuote receive a quantity computeMaterials did not return", () => {
    const step7 = SYSTEM_PROMPT.split(NL).find((line) => line.startsWith("7. "));
    for (const part of ["solo las cantidades que computeMaterials devolvió", "boxes", "bags", "units", "no entra en buildQuote", "Requiere revisión", "di qué dato falta", "nunca escribas una cantidad"]) {
      expect(step7, part).toContain(part);
    }
  });
});
