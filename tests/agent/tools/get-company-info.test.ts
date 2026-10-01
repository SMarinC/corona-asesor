import { describe, expect, it } from "vitest";
import { executeGetCompanyInfo, getCompanyInfoInput } from "@/lib/agent/tools/get-company-info";
import { COMPANY_SECTIONS } from "@/lib/data/company";
import { makeToolDeps } from "@/tests/fixtures/tool-deps";

describe("getCompanyInfo tool", () => {
  const deps = makeToolDeps();

  it("returns the company overview and the list of sections by default", () => {
    const result = executeGetCompanyInfo(deps, {});
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.section).toBe("empresa");
    expect(result.data.availableSections).toEqual(COMPANY_SECTIONS);
    expect(result.data.content).toMatchObject({ nombre: "Organización Corona" });
  });

  it("returns links for out-of-catalog categories", () => {
    const result = executeGetCompanyInfo(deps, { section: "categorias_fuera_de_catalogo" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(JSON.stringify(result.data.content)).toContain("https://corona.co/productos/sanitarios");
  });

  it("only accepts known sections", () => {
    expect(getCompanyInfoInput.safeParse({ section: "precios" }).success).toBe(false);
  });
});
