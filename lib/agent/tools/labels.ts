/**
 * Canonical design styles the model can ask for. Each maps to a normalized needle that matches the
 * catalog's inconsistent labels ("Marmolizado"/"Mármol", "Maderas"/"Madera", "Modernas estruct y con efect", …).
 * A test asserts every design label in data/catalog.json is covered.
 */
export const DESIGN_LABELS = {
  marmol: "marm",
  madera: "madera",
  natural: "natural",
  neutro: "neutra",
  moderno: "moderna",
  hexagonal: "hexagon",
  exterior: "exterior",
  plano: "plano",
  fachaleta: "fachaleta",
  terrazo: "terrazo",
  ornamental: "ornamental",
  cemento: "cemento",
} as const;

export type DesignLabel = keyof typeof DESIGN_LABELS;
export const DESIGN_LABEL_KEYS = Object.keys(DESIGN_LABELS) as [DesignLabel, ...DesignLabel[]];

/** Finish labels exactly as the catalog writes them (the domain compares them normalized). */
export const FINISH_LABELS = ["Brillante", "Mate", "Semibrillante", "Semimate", "Satinado"] as const;

export const TILE_MATERIALS = ["ceramic", "porcelain", "porcelatech", "stoneware"] as const;
