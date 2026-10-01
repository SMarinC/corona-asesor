import { normalizeText } from "./parse";
import type { TileMaterial, TriState } from "./types";

export interface AdhesiveLine {
  /** Normalized substring of the product name that identifies the line. */
  key: string;
  compatibleMaterials: TileMaterial[];
  excludedMaterials: TileMaterial[];
  outdoor: TriState;
  /** Verbatim quote from the line's technical sheet ("Usos"). The pipeline fails if it is not found. */
  evidence: string;
}

export const ADHESIVE_LINES: AdhesiveLine[] = [
  {
    key: "capa gruesa",
    compatibleMaterials: ["ceramic", "porcelain", "porcelatech", "stoneware"],
    excludedMaterials: [],
    outdoor: true,
    evidence: "cualquier tipo de baldosa cerámica, gres porcelánico, o piedra natural en pavimentos, interior o exterior",
  },
  {
    key: "ceramico",
    compatibleMaterials: ["ceramic"],
    excludedMaterials: ["porcelain"],
    outdoor: true,
    evidence: "revestimientos Cerámicos de media o alta absorción (no gres porcelánico), en pisos y paredes en zonas Interiores y Exteriores",
  },
  {
    key: "flex",
    compatibleMaterials: ["ceramic", "porcelain", "porcelatech", "stoneware"],
    excludedMaterials: [],
    outdoor: true,
    evidence: "todo tipo de revestimientos cerámicos. Es ideal para la instalación de revestimientos en fachadas, piscinas y fuentes",
  },
  {
    key: "interiores",
    compatibleMaterials: ["ceramic"],
    excludedMaterials: ["porcelain"],
    outdoor: false,
    evidence: "revestimientos cerámicos de media o alta absorción (no gres porcelánico), en pisos y paredes en zonas interiores",
  },
  {
    key: "max",
    compatibleMaterials: ["ceramic", "porcelain"],
    excludedMaterials: [],
    outdoor: true,
    evidence: "revestimientos cerámicos de baja absorción (gres porcelánico, vidriados, etc.) en pisos y paredes en zonas interiores y exteriores",
  },
  {
    key: "porcelanico",
    compatibleMaterials: ["porcelain"],
    excludedMaterials: [],
    outdoor: false,
    evidence: "revestimientos cerámicos de baja absorción o poco poroso (gres porcelánico) en zonas interiores",
  },
  {
    key: "ultra",
    compatibleMaterials: ["ceramic", "porcelatech"],
    excludedMaterials: ["porcelain"],
    outdoor: true,
    evidence: "revestimientos cerámicos de media o alta absorción (no gres porcelánico) y PorcelaTech Corona®, en pisos y paredes en zonas interior y exterior",
  },
];

export function findAdhesiveLine(name: string): AdhesiveLine | null {
  const normalized = normalizeText(name);
  return ADHESIVE_LINES.find((line) => normalized.includes(line.key)) ?? null;
}
