import type { Adhesive, Grout, Tile } from "@/lib/domain/types";
import type { ToolDeps } from "./deps";
import { type ToolError, toolError } from "./result";

interface KindMap {
  tile: Tile;
  adhesive: Adhesive;
  grout: Grout;
}

const KIND_ES: Record<keyof KindMap, string> = { tile: "un revestimiento", adhesive: "un pegante", grout: "una boquilla" };

/** Resolves a SKU that must be of a given kind; problems come back as tool errors, never exceptions. */
export function lookup<K extends keyof KindMap>(deps: ToolDeps, sku: string, kind: K): KindMap[K] | ToolError {
  const product = deps.catalog.get(sku);
  if (!product) return toolError("unknown_sku", `El SKU ${sku} no existe en el catálogo.`);
  if (product.kind !== kind) return toolError("wrong_kind", `El SKU ${sku} no es ${KIND_ES[kind]}.`);
  return product as KindMap[K];
}

export const isToolError = (value: unknown): value is ToolError =>
  typeof value === "object" && value !== null && (value as { status?: unknown }).status === "error";
