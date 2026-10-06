import { tool } from "ai";
import { z } from "zod";
import {
  type AreaResult,
  computeAdhesive,
  computeArea,
  computeBoxes,
  computeGrout,
  DEFAULT_WASTE_PCT,
  GROUT_DENSITY_G_CM3,
} from "@/lib/domain/calculations";
import type { ToolDeps } from "./deps";
import { isToolError, lookup } from "./lookup";
import { type MissingField, needsReview, ok, runTool, type ToolResult, toolError } from "./result";

/** Every data value comes from the catalog: the model only supplies the room, the SKUs and the joint width. */
export const computeMaterialsInput = z.object({
  lengthM: z.number().positive().max(100).describe("Largo del espacio en metros."),
  widthM: z.number().positive().max(100).describe("Ancho del espacio en metros."),
  wastePct: z.number().min(0).max(0.5).optional().describe("Desperdicio como fracción (0.1 = 10 %). Por defecto 0.1."),
  tileSku: z.string().min(1).max(20),
  adhesiveSku: z.string().min(1).max(20).optional(),
  groutSku: z.string().min(1).max(20).optional(),
  jointWidthMm: z.number().positive().max(30).optional().describe("Ancho de junta en mm; necesario para calcular la boquilla."),
});
export type ComputeMaterialsInput = z.infer<typeof computeMaterialsInput>;

export interface TileQuantity {
  sku: string;
  name: string;
  m2PerBox: number;
  boxes: number;
  coveredM2: number;
}

export interface AdhesiveQuantity {
  sku: string;
  name: string;
  coverageKgM2: number;
  bagKg: number;
  kg: number;
  bags: number;
  note: string;
}

export interface GroutQuantity {
  sku: string;
  name: string;
  jointWidthMm: number;
  consumptionKgM2: number;
  kg: number;
  packageKg: number;
  units: number;
  note: string;
}

export interface MaterialsData {
  area: AreaResult;
  tile: TileQuantity;
  adhesive: AdhesiveQuantity | null;
  grout: GroutQuantity | null;
}

const ADHESIVE_NOTE = "Usa el límite superior del rendimiento de la ficha (estimación conservadora) sobre el área sin desperdicio.";
const GROUT_NOTE = `Estimación por volumen de junta (densidad ${GROUT_DENSITY_G_CM3} g/cm³, profundidad = espesor del revestimiento) sobre el área sin desperdicio.`;

export function executeComputeMaterials(deps: ToolDeps, input: ComputeMaterialsInput): ToolResult<MaterialsData> {
  const tile = lookup(deps, input.tileSku, "tile");
  if (isToolError(tile)) return tile;
  const adhesive = input.adhesiveSku === undefined ? null : lookup(deps, input.adhesiveSku, "adhesive");
  if (isToolError(adhesive)) return adhesive;
  const grout = input.groutSku === undefined ? null : lookup(deps, input.groutSku, "grout");
  if (isToolError(grout)) return grout;
  if (grout?.groutType === "repair") {
    return toolError("invalid_input", `${grout.name} es un producto de reparación, no de emboquillado.`);
  }

  const area = computeArea(input.lengthM, input.widthM, input.wastePct ?? DEFAULT_WASTE_PCT);
  const missing: MissingField[] = [];

  let tileQuantity: TileQuantity | undefined;
  if (tile.m2PerBox !== null) {
    const { boxes, coveredM2 } = computeBoxes(area.areaWithWasteM2, tile.m2PerBox);
    tileQuantity = { sku: tile.sku, name: tile.name, m2PerBox: tile.m2PerBox, boxes, coveredM2 };
  } else {
    missing.push({ field: "m2PerBox", reason: `El catálogo no indica los m² por caja de ${tile.name}; sin ese dato no se pueden calcular las cajas.` });
  }

  let adhesiveQuantity: AdhesiveQuantity | undefined;
  if (adhesive) {
    const coverage = adhesive.coverageKgM2?.max ?? null;
    const { bagKg } = adhesive;
    if (coverage === null) missing.push({ field: "adhesiveCoverageKgM2", reason: `El catálogo no indica el rendimiento (kg/m²) de ${adhesive.name}.` });
    if (bagKg === null) missing.push({ field: "bagKg", reason: `El catálogo no indica el peso del bulto de ${adhesive.name}.` });
    if (coverage !== null && bagKg !== null) {
      const { kg, bags } = computeAdhesive(area.areaM2, coverage, bagKg);
      adhesiveQuantity = { sku: adhesive.sku, name: adhesive.name, coverageKgM2: coverage, bagKg, kg, bags, note: ADHESIVE_NOTE };
    }
  }

  let groutQuantity: GroutQuantity | undefined;
  if (grout) {
    const joint = input.jointWidthMm;
    const format = tile.formatMm;
    const thickness = tile.thicknessMm;
    const packageKg = grout.packageKg;
    if (joint === undefined) missing.push({ field: "jointWidthMm", reason: "Falta el ancho de junta del proyecto (mm); sin ese dato no se puede calcular la boquilla." });
    if (format === null) missing.push({ field: "formatMm", reason: `El catálogo no indica el formato de ${tile.name}; sin el formato no se puede calcular la boquilla.` });
    if (thickness === null) missing.push({ field: "thicknessMm", reason: `El catálogo no indica el espesor de ${tile.name}; sin el espesor no se puede calcular la boquilla.` });
    if (packageKg === null) missing.push({ field: "packageKg", reason: `El catálogo no indica el peso por unidad de ${grout.name}; sin ese dato no se puede calcular la boquilla.` });
    if (joint !== undefined && format !== null && thickness !== null && packageKg !== null) {
      const { consumptionKgM2, kg, units } = computeGrout(area.areaM2, format, thickness, joint, packageKg);
      groutQuantity = { sku: grout.sku, name: grout.name, jointWidthMm: joint, consumptionKgM2, kg, packageKg, units, note: GROUT_NOTE };
    }
  }

  if (missing.length === 0 && tileQuantity) {
    return ok({ area, tile: tileQuantity, adhesive: adhesiveQuantity ?? null, grout: groutQuantity ?? null });
  }
  return needsReview<MaterialsData>({ area, tile: tileQuantity, adhesive: adhesive ? adhesiveQuantity : null, grout: grout ? groutQuantity : null }, missing);
}

export const createComputeMaterialsTool = (deps: ToolDeps) =>
  tool({
    description:
      "Calcula para un espacio rectangular: área con desperdicio, cajas de revestimiento, kg y bultos de pegante, y kg y unidades de boquilla. Todos los datos de producto salen del catálogo. Devuelve needs_review con lo que falte.",
    inputSchema: computeMaterialsInput,
    execute: (input) =>
      runTool("computeMaterials", () => {
        const result = executeComputeMaterials(deps, input);
        if (result.status !== "error") deps.quantities?.recordCalculation(input.tileSku, result.data);
        return result;
      }),
  });
