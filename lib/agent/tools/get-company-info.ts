import { tool } from "ai";
import { z } from "zod";
import { COMPANY_SECTIONS, type CompanySection } from "@/lib/data/company";
import type { ToolDeps } from "./deps";
import { ok, runTool, type ToolResult } from "./result";

export const getCompanyInfoInput = z.object({
  section: z
    .enum(COMPANY_SECTIONS)
    .optional()
    .describe("Sección a consultar. Sin sección devuelve la descripción general de la empresa y la lista de secciones."),
});
export type GetCompanyInfoInput = z.infer<typeof getCompanyInfoInput>;

export interface CompanyInfoData {
  section: CompanySection;
  availableSections: readonly CompanySection[];
  content: unknown;
}

export function executeGetCompanyInfo(deps: ToolDeps, input: GetCompanyInfoInput): ToolResult<CompanyInfoData> {
  const section = input.section ?? "empresa";
  return ok({ section, availableSections: COMPANY_SECTIONS, content: deps.company[section] });
}

export const createGetCompanyInfoTool = (deps: ToolDeps) =>
  tool({
    description:
      "Información institucional de Organización Corona (empresa, contacto, garantías, puntos de venta, compra en línea) y enlaces a categorías que no están en este catálogo (sanitarios, griferías, pinturas, etc.). Úsala en vez de inventar datos de la empresa o de productos fuera del catálogo.",
    inputSchema: getCompanyInfoInput,
    execute: (input) => runTool("getCompanyInfo", () => executeGetCompanyInfo(deps, input)),
  });
