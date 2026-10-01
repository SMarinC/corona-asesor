import type { Adhesive, Environment, Grout, Tile, TileMaterial, Traffic } from "./types";

export type Verdict = "compatible" | "incompatible" | "needs_review";

export interface ProjectConditions {
  environment: Environment;
  wetArea: boolean;
  traffic: Traffic;
  jointWidthMm?: number;
}

export interface Check {
  rule: string;
  verdict: Verdict;
  /** Spanish, shown to the end user. */
  message: string;
  citationId?: string;
}

export interface CompatibilityResult {
  verdict: Verdict;
  checks: Check[];
}

const SEVERITY: Record<Verdict, number> = { compatible: 0, needs_review: 1, incompatible: 2 };
const TRAFFIC_RANK: Record<Traffic, number> = { low: 1, medium: 2, high: 3 };
const TRAFFIC_ES: Record<Traffic, string> = { low: "bajo", medium: "medio", high: "alto" };
const MATERIAL_ES: Record<TileMaterial, string> = {
  ceramic: "cerámica",
  porcelain: "gres porcelánico",
  porcelatech: "PorcelaTech",
  stoneware: "gres",
};

const materialNames = (materials: TileMaterial[]) => materials.map((m) => MATERIAL_ES[m]).join(", ");

export function worstVerdict(verdicts: Verdict[]): Verdict {
  return verdicts.reduce<Verdict>((worst, v) => (SEVERITY[v] > SEVERITY[worst] ? v : worst), "compatible");
}

function checkEnvironment(tile: Tile, project: ProjectConditions): Check {
  const rule = "Ambiente";
  const outdoor = project.environment === "outdoor";
  const value = outdoor ? tile.outdoor : tile.indoor;
  const where = outdoor ? "exteriores" : "interiores";
  if (value === true) return { rule, verdict: "compatible", message: `Indicado para ${where} según sus áreas de uso.` };
  if (value === false) return { rule, verdict: "incompatible", message: `No está indicado para ${where} en sus áreas de uso.` };
  return { rule, verdict: "needs_review", message: `El producto no declara áreas de uso; no se puede confirmar su uso en ${where}.` };
}

function checkHumidity(tile: Tile, project: ProjectConditions): Check {
  const rule = "Humedad";
  if (!project.wetArea) return { rule, verdict: "compatible", message: "El espacio no es zona húmeda." };
  if (tile.wetArea === true) {
    return { rule, verdict: "compatible", message: "Indicado para zonas húmedas (baño, cocina o exteriores) según sus áreas de uso." };
  }
  if (tile.wetArea === false) return { rule, verdict: "incompatible", message: "No está indicado para zonas húmedas en sus áreas de uso." };
  return { rule, verdict: "needs_review", message: "El producto no declara áreas de uso; no se puede confirmar su uso en zonas húmedas." };
}

function checkTraffic(tile: Tile, project: ProjectConditions): Check {
  const rule = "Tráfico";
  if (tile.surface === "wall") return { rule, verdict: "compatible", message: "Revestimiento de pared: no recibe tránsito." };
  if (tile.traffic === null) {
    return { rule, verdict: "needs_review", message: `La ficha no declara un nivel de tráfico utilizable (${tile.trafficLabel ?? "sin dato"}).` };
  }
  const label = tile.trafficLabel ?? TRAFFIC_ES[tile.traffic];
  if (TRAFFIC_RANK[tile.traffic] >= TRAFFIC_RANK[project.traffic]) {
    return { rule, verdict: "compatible", message: `Tráfico de la ficha: ${label}; soporta tráfico ${TRAFFIC_ES[project.traffic]}.` };
  }
  return { rule, verdict: "incompatible", message: `Tráfico de la ficha: ${label}; insuficiente para tráfico ${TRAFFIC_ES[project.traffic]}.` };
}

function checkAvailability(label: string, product: { name: string; inStock: boolean }): Check {
  const rule = `Disponibilidad (${label})`;
  return product.inStock
    ? { rule, verdict: "compatible", message: `${product.name}: disponible.` }
    : { rule, verdict: "incompatible", message: `${product.name}: sin disponibilidad.` };
}

function checkAdhesive(tile: Tile, adhesive: Adhesive, project: ProjectConditions): Check[] {
  const citation = adhesive.compatibilityCitationId ?? undefined;
  const checks: Check[] = [];

  const rule = "Pegante ↔ material";
  if (tile.materials.length === 0) {
    checks.push({ rule, verdict: "needs_review", message: "El revestimiento no declara su material." });
  } else if (adhesive.compatibleMaterials === null) {
    checks.push({ rule, verdict: "needs_review", message: "No hay una indicación verificada en la ficha del pegante sobre materiales compatibles." });
  } else {
    const excluded = tile.materials.filter((m) => adhesive.excludedMaterials.includes(m));
    const missing = tile.materials.filter((m) => !adhesive.compatibleMaterials!.includes(m));
    if (excluded.length > 0) {
      checks.push({ rule, verdict: "incompatible", message: `La ficha del pegante excluye ${materialNames(excluded)}.`, citationId: citation });
    } else if (missing.length > 0) {
      checks.push({ rule, verdict: "needs_review", message: `La ficha del pegante no menciona ${materialNames(missing)}.`, citationId: citation });
    } else {
      checks.push({ rule, verdict: "compatible", message: `La ficha del pegante lo indica para ${materialNames(tile.materials)}.`, citationId: citation });
    }
  }

  if (project.environment === "outdoor") {
    const envRule = "Pegante ↔ ambiente";
    if (adhesive.outdoor === true) {
      checks.push({ rule: envRule, verdict: "compatible", message: "La ficha lo indica para exteriores.", citationId: citation });
    } else if (adhesive.outdoor === false) {
      checks.push({ rule: envRule, verdict: "incompatible", message: "La ficha lo limita a zonas interiores.", citationId: citation });
    } else {
      checks.push({ rule: envRule, verdict: "needs_review", message: "La ficha del pegante no confirma su uso en exteriores." });
    }
  }

  checks.push(checkAvailability("pegante", adhesive));
  return checks;
}

function checkGrout(grout: Grout, project: ProjectConditions): Check[] {
  const rule = "Boquilla ↔ junta";
  let joint: Check;
  if (grout.groutType === "repair") {
    joint = { rule, verdict: "incompatible", message: "Es un producto de reparación, no de emboquillado." };
  } else if (project.jointWidthMm === undefined) {
    joint = { rule, verdict: "needs_review", message: "No se ha definido el ancho de junta del proyecto." };
  } else if (grout.jointMm === null) {
    joint = { rule, verdict: "needs_review", message: "La ficha de la boquilla no declara su rango de junta." };
  } else {
    const { min, max } = grout.jointMm;
    const inRange = project.jointWidthMm >= min && project.jointWidthMm <= max;
    joint = {
      rule,
      verdict: inRange ? "compatible" : "incompatible",
      message: `Junta de ${project.jointWidthMm} mm ${inRange ? "dentro" : "fuera"} del rango ${min}–${max} mm de la ficha.`,
      citationId: grout.jointCitationId ?? undefined,
    };
  }
  return [joint, checkAvailability("boquilla", grout)];
}

export function evaluateCompatibility(
  tile: Tile,
  project: ProjectConditions,
  adhesive?: Adhesive,
  grout?: Grout,
): CompatibilityResult {
  const checks: Check[] = [
    checkEnvironment(tile, project),
    checkHumidity(tile, project),
    checkTraffic(tile, project),
    checkAvailability("revestimiento", tile),
  ];
  if (adhesive) checks.push(...checkAdhesive(tile, adhesive, project));
  if (grout) checks.push(...checkGrout(grout, project));
  return { verdict: worstVerdict(checks.map((c) => c.verdict)), checks };
}
