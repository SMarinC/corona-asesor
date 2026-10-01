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
import { type CitationField, type CitedValue, verifyCitedValue } from "@/lib/domain/citations";
import type { ToolDeps } from "./deps";
import { isToolError, lookup } from "./lookup";
import { type MissingField, needsReview, ok, runTool, type ToolResult, toolError } from "./result";

const citedValue = z.object({
  value: z.number().positive(),
  citationId: z.string().min(1).max(10).describe("citationId del fragmento de ficha técnica, p. ej. c0170."),
});

export const computeMaterialsInput = z.object({
  lengthM: z.number().positive().max(100).describe("Largo del espacio en metros."),
  widthM: z.number().positive().max(100).describe("Ancho del espacio en metros."),
  wastePct: z.number().min(0).max(0.5).optional().describe("Desperdicio como fracción (0.1 = 10 %). Por defecto 0.1."),
  tileSku: z.string().min(1).max(20),
  adhesiveSku: z.string().min(1).max(20).optional(),
  groutSku: z.string().min(1).max(20).optional(),
  jointWidthMm: z.number().positive().max(30).optional().describe("Ancho de junta en mm; necesario para calcular la boquilla."),
  overrides: z
    .object({
      m2PerBox: citedValue.optional(),
      adhesiveCoverageKgM2: citedValue.optional(),
      bagKg: citedValue.optional(),
    })
    .optional()
    .describe("Solo para datos que el catálogo no trae, leídos de una ficha con searchTechnicalSheets. Se verifican contra el fragmento citado."),
});
export type ComputeMaterialsInput = z.infer<typeof computeMaterialsInput>;

export type OverrideField = "m2PerBox" | "adhesiveCoverageKgM2" | "bagKg";
export type ValueSource = "catalog" | "citation";
export type RejectionReason = "unknown_citation" | "citation_other_product" | "value_not_in_citation" | "catalog_has_value";

export interface RejectedOverride {
  field: OverrideField;
  citationId: string;
  reason: RejectionReason;
  message: string;
}

export interface TileQuantity {
  sku: string;
  name: string;
  m2PerBox: number;
  m2PerBoxSource: ValueSource;
  citationId: string | null;
  boxes: number;
  coveredM2: number;
}

export interface AdhesiveQuantity {
  sku: string;
  name: string;
  coverageKgM2: number;
  bagKg: number;
  /** Fragments that supplied values missing from the catalog. */
  citationIds: string[];
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
  rejectedOverrides: RejectedOverride[];
}

const REJECTION_ES: Record<RejectionReason, string> = {
  unknown_citation: "El citationId no existe en las fichas técnicas.",
  citation_other_product: "El fragmento citado no pertenece a ese producto.",
  value_not_in_citation: "El valor no aparece en el fragmento citado junto al dato correspondiente.",
  catalog_has_value: "El catálogo ya trae este dato; se usa el valor del catálogo.",
};

const ADHESIVE_NOTE = "Usa el límite superior del rendimiento de la ficha (estimación conservadora) sobre el área sin desperdicio.";
const GROUT_NOTE = `Estimación por volumen de junta (densidad ${GROUT_DENSITY_G_CM3} g/cm³, profundidad = espesor del revestimiento) sobre el área sin desperdicio.`;

interface Resolved {
  value: number;
  source: ValueSource;
  citationId: string | null;
}

/** Catalog values win; a cited value fills a gap only if its fragment really states it for that SKU. */
function resolveValue(
  deps: ToolDeps,
  sku: string,
  field: OverrideField,
  citationField: CitationField,
  catalogValue: number | null,
  cited: CitedValue | undefined,
  rejected: RejectedOverride[],
): Resolved | null {
  if (catalogValue !== null) {
    if (cited && cited.value !== catalogValue) {
      rejected.push({ field, citationId: cited.citationId, reason: "catalog_has_value", message: REJECTION_ES.catalog_has_value });
    }
    return { value: catalogValue, source: "catalog", citationId: null };
  }
  if (!cited) return null;
  const check = verifyCitedValue(cited, sku, (id) => deps.sheets.getChunk(id), citationField);
  if (check.ok) return { value: cited.value, source: "citation", citationId: cited.citationId };
  rejected.push({ field, citationId: cited.citationId, reason: check.reason, message: REJECTION_ES[check.reason] });
  return null;
}

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
  const overrides = input.overrides ?? {};
  const missing: MissingField[] = [];
  const rejectedOverrides: RejectedOverride[] = [];

  let tileQuantity: TileQuantity | undefined;
  const m2PerBox = resolveValue(deps, tile.sku, "m2PerBox", "m2PerBox", tile.m2PerBox, overrides.m2PerBox, rejectedOverrides);
  if (m2PerBox) {
    const { boxes, coveredM2 } = computeBoxes(area.areaWithWasteM2, m2PerBox.value);
    tileQuantity = { sku: tile.sku, name: tile.name, m2PerBox: m2PerBox.value, m2PerBoxSource: m2PerBox.source, citationId: m2PerBox.citationId, boxes, coveredM2 };
  } else {
    missing.push({ field: "m2PerBox", reason: `El catálogo no indica los m² por caja de ${tile.name}; búscalo en su ficha técnica y cítalo.` });
  }

  let adhesiveQuantity: AdhesiveQuantity | undefined;
  if (adhesive) {
    const coverage = resolveValue(deps, adhesive.sku, "adhesiveCoverageKgM2", "coverageKgM2", adhesive.coverageKgM2?.max ?? null, overrides.adhesiveCoverageKgM2, rejectedOverrides);
    const bagKg = resolveValue(deps, adhesive.sku, "bagKg", "bagKg", adhesive.bagKg, overrides.bagKg, rejectedOverrides);
    if (!coverage) missing.push({ field: "adhesiveCoverageKgM2", reason: `No hay rendimiento (kg/m²) verificado para ${adhesive.name}.` });
    if (!bagKg) missing.push({ field: "bagKg", reason: `No hay peso del bulto verificado para ${adhesive.name}.` });
    if (coverage && bagKg) {
      const { kg, bags } = computeAdhesive(area.areaM2, coverage.value, bagKg.value);
      const citationIds = [...new Set([coverage.citationId, bagKg.citationId].filter((id): id is string => id !== null))];
      adhesiveQuantity = { sku: adhesive.sku, name: adhesive.name, coverageKgM2: coverage.value, bagKg: bagKg.value, citationIds, kg, bags, note: ADHESIVE_NOTE };
    }
  }

  let groutQuantity: GroutQuantity | undefined;
  if (grout) {
    const joint = input.jointWidthMm;
    const format = tile.formatMm;
    const thickness = tile.thicknessMm;
    const packageKg = grout.packageKg;
    if (joint === undefined) missing.push({ field: "jointWidthMm", reason: "Falta el ancho de junta del proyecto (mm)." });
    if (format === null) missing.push({ field: "formatMm", reason: `El catálogo no indica el formato de ${tile.name}.` });
    if (thickness === null) missing.push({ field: "thicknessMm", reason: `El catálogo no indica el espesor de ${tile.name}.` });
    if (packageKg === null) missing.push({ field: "packageKg", reason: `El catálogo no indica el peso por unidad de ${grout.name}.` });
    if (joint !== undefined && format !== null && thickness !== null && packageKg !== null) {
      const { consumptionKgM2, kg, units } = computeGrout(area.areaM2, format, thickness, joint, packageKg);
      groutQuantity = { sku: grout.sku, name: grout.name, jointWidthMm: joint, consumptionKgM2, kg, packageKg, units, note: GROUT_NOTE };
    }
  }

  if (missing.length === 0 && tileQuantity) {
    return ok({ area, tile: tileQuantity, adhesive: adhesiveQuantity ?? null, grout: groutQuantity ?? null, rejectedOverrides });
  }
  return needsReview<MaterialsData>(
    { area, tile: tileQuantity, adhesive: adhesive ? adhesiveQuantity : null, grout: grout ? groutQuantity : null, rejectedOverrides },
    missing,
  );
}

export const createComputeMaterialsTool = (deps: ToolDeps) =>
  tool({
    description:
      "Calcula para un espacio rectangular: área con desperdicio, cajas de revestimiento, kg y bultos de pegante, y kg y unidades de boquilla. Usa datos del catálogo; si falta uno (m² por caja, rendimiento o peso del bulto) acepta un valor citado de una ficha técnica y lo verifica. Devuelve needs_review con lo que falte.",
    inputSchema: computeMaterialsInput,
    execute: (input) => runTool("computeMaterials", () => executeComputeMaterials(deps, input)),
  });
