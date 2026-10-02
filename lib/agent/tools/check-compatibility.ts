import { tool } from "ai";
import { z } from "zod";
import { type Check, evaluateCompatibility, type ProjectConditions, type Verdict } from "@/lib/domain/compatibility";
import type { Traffic } from "@/lib/domain/types";
import type { ToolDeps } from "./deps";
import { isToolError, lookup } from "./lookup";
import { ok, runTool, type ToolResult, toolError } from "./result";

export const checkCompatibilityInput = z.object({
  tileSku: z.string().min(1).max(20),
  surface: z.enum(["floor", "wall"]),
  environment: z.enum(["indoor", "outdoor"]),
  wetArea: z.boolean(),
  traffic: z.enum(["low", "medium", "high"]).optional().describe("Tráfico esperado. Obligatorio para pisos; en paredes no aplica."),
  jointWidthMm: z.number().positive().max(30).optional(),
  adhesiveSku: z.string().min(1).max(20).optional(),
  groutSku: z.string().min(1).max(20).optional(),
});
export type CheckCompatibilityInput = z.infer<typeof checkCompatibilityInput>;

export const VERDICT_LABEL: Record<Verdict, string> = {
  compatible: "Compatible",
  incompatible: "Incompatible",
  needs_review: "Requiere revisión",
};

interface ProductRef {
  sku: string;
  name: string;
}

export interface CompatibilityData {
  verdict: Verdict;
  verdictLabel: string;
  checks: Check[];
  /** Every citationId in `checks`, deduplicated, so the model can cite them without digging into each check. */
  citationIds: string[];
  /** The conditions as the user gave them; `traffic` is null when it was not given (walls). */
  project: Omit<ProjectConditions, "traffic"> & { traffic: Traffic | null };
  products: { tile: ProductRef; adhesive: ProductRef | null; grout: ProductRef | null };
}

const ref = (p: ProductRef): ProductRef => ({ sku: p.sku, name: p.name });

export function executeCheckCompatibility(deps: ToolDeps, input: CheckCompatibilityInput): ToolResult<CompatibilityData> {
  if (input.surface === "floor" && input.traffic === undefined) {
    return toolError("invalid_input", "Para pisos indica el tráfico esperado: low, medium o high.");
  }
  const tile = lookup(deps, input.tileSku, "tile");
  if (isToolError(tile)) return tile;
  const adhesive = input.adhesiveSku === undefined ? null : lookup(deps, input.adhesiveSku, "adhesive");
  if (isToolError(adhesive)) return adhesive;
  const grout = input.groutSku === undefined ? null : lookup(deps, input.groutSku, "grout");
  if (isToolError(grout)) return grout;

  const project: ProjectConditions = {
    surface: input.surface,
    environment: input.environment,
    wetArea: input.wetArea,
    // The traffic rule is skipped for walls, so the placeholder never reaches a verdict.
    traffic: input.traffic ?? "low",
    jointWidthMm: input.jointWidthMm,
  };
  const { verdict, checks } = evaluateCompatibility(tile, project, adhesive ?? undefined, grout ?? undefined);
  const citationIds = [...new Set(checks.flatMap((check) => (check.citationId ? [check.citationId] : [])))];
  return ok({
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    checks,
    citationIds,
    project: { ...project, traffic: input.traffic ?? null },
    products: { tile: ref(tile), adhesive: adhesive ? ref(adhesive) : null, grout: grout ? ref(grout) : null },
  });
}

export const createCheckCompatibilityTool = (deps: ToolDeps) =>
  tool({
    description:
      "Verifica revestimiento + pegante + boquilla contra las condiciones del proyecto (superficie, ambiente, humedad, tráfico, junta, disponibilidad). El veredicto es el peor de las reglas; un dato desconocido da 'Requiere revisión', nunca 'Incompatible'.",
    inputSchema: checkCompatibilityInput,
    execute: (input) => runTool("checkCompatibility", () => executeCheckCompatibility(deps, input)),
  });
