import type { QuotableAdhesive, QuotableGrout, QuotableTile } from "@/lib/domain/quotable";
import type { ToolDeps } from "./deps";
import { type ToolError, toolError } from "./result";

interface KindMap {
  tile: QuotableTile;
  adhesive: QuotableAdhesive;
  grout: QuotableGrout;
}

const KIND_ES: Record<keyof KindMap, string> = { tile: "un revestimiento", adhesive: "un pegante", grout: "una boquilla" };

/** The error for a SKU the catalog does not offer: its data lacks a value a quote needs, or it does not exist. */
export function notOffered(deps: ToolDeps, sku: string): ToolError {
  const reason = deps.catalog.notQuotable(sku);
  return reason === undefined ? toolError("unknown_sku", `El SKU ${sku} no existe en el catálogo.`) : toolError("not_quotable", reason);
}

/** Resolves a SKU that must be of a given kind; problems come back as tool errors, never exceptions. */
export function lookup<K extends keyof KindMap>(deps: ToolDeps, sku: string, kind: K): KindMap[K] | ToolError {
  const product = deps.catalog.get(sku);
  if (!product) return notOffered(deps, sku);
  if (product.kind !== kind) return toolError("wrong_kind", `El SKU ${sku} no es ${KIND_ES[kind]}.`);
  return product as KindMap[K];
}

export const isToolError = (value: unknown): value is ToolError =>
  typeof value === "object" && value !== null && (value as { status?: unknown }).status === "error";
