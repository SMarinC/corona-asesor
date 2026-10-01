import { describe, expect, it } from "vitest";
import { COMPANY_SECTIONS, getCompanyContext, parseCompanyContext } from "@/lib/data/company";

describe("getCompanyContext (data/company-context.json)", () => {
  it("exposes every section", () => {
    const company = getCompanyContext();
    for (const section of COMPANY_SECTIONS) expect(company[section], section).toBeDefined();
    expect(company.empresa).toMatchObject({ nombre: "Organización Corona" });
  });

  it("drops internal notes from the out-of-catalog section", () => {
    const outOfCatalog = getCompanyContext().categorias_fuera_de_catalogo as Record<string, unknown>;
    expect(outOfCatalog._nota).toBeUndefined();
    expect(Array.isArray(outOfCatalog.productos)).toBe(true);
  });

  it("fails loudly when a section is missing", () => {
    expect(() => parseCompanyContext({ info_general: {} })).toThrow(/empresa/);
  });
});
