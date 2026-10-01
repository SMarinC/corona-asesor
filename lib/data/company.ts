import { readFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./catalog";

/** The 12 keys of `info_general` plus the out-of-catalog redirect list. */
export const COMPANY_SECTIONS = [
  "empresa",
  "marcas_y_unidades_de_negocio",
  "sitios_relacionados",
  "puntos_de_venta",
  "contacto",
  "garantias",
  "financiacion",
  "servicios_para_el_cliente",
  "sostenibilidad",
  "sello_ambiental_colombiano",
  "premios_y_reconocimientos",
  "compra_online",
  "categorias_fuera_de_catalogo",
] as const;

export type CompanySection = (typeof COMPANY_SECTIONS)[number];
export type CompanyContext = Record<CompanySection, unknown>;

/** Keys starting with "_" are notes for maintainers, not content for users. */
function withoutNotes(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("_")));
}

export function parseCompanyContext(raw: unknown): CompanyContext {
  const root = raw as { info_general?: Record<string, unknown>; categorias_fuera_de_catalogo?: unknown };
  const context = {} as CompanyContext;
  for (const section of COMPANY_SECTIONS) {
    const value = section === "categorias_fuera_de_catalogo" ? root.categorias_fuera_de_catalogo : root.info_general?.[section];
    if (value === undefined) throw new Error(`data/company-context.json is missing section "${section}"`);
    context[section] = withoutNotes(value);
  }
  return context;
}

let cached: CompanyContext | null = null;

export function getCompanyContext(): CompanyContext {
  cached ??= parseCompanyContext(JSON.parse(readFileSync(path.join(DATA_DIR, "company-context.json"), "utf8")));
  return cached;
}
