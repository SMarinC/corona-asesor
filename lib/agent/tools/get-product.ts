import { tool } from "ai";
import { z } from "zod";
import type { Product } from "@/lib/domain/types";
import type { ToolDeps } from "./deps";
import { ok, runTool, toModelOutput, toolError, type ToolResult } from "./result";

export const getProductInput = z.object({ sku: z.string().min(1).max(20) });
export type GetProductInput = z.infer<typeof getProductInput>;

export interface GetProductData {
  product: Product;
}

export function executeGetProduct(deps: ToolDeps, input: GetProductInput): ToolResult<GetProductData> {
  const product = deps.catalog.get(input.sku);
  if (!product) return toolError("unknown_sku", `El SKU ${input.sku} no existe en el catálogo.`);
  return ok({ product });
}

export const createGetProductTool = (deps: ToolDeps) =>
  tool({
    description: "Devuelve todos los datos normalizados de un producto del catálogo por su SKU.",
    inputSchema: getProductInput,
    execute: (input) => runTool("getProduct", () => executeGetProduct(deps, input)),
    toModelOutput,
  });
