import type { ToolName } from "@/lib/ui/tool-parts";

/** What one user turn must produce. Universal checks (completion, steps, money, quantities, review) always run. */
export interface TurnExpect {
  /** Tools that must run in this turn. */
  must?: ToolName[];
  /** Tools that must not run in this turn. */
  mustNot?: ToolName[];
  /** "within" / "over" budget, "no-budget" (a quote without a budget verdict) or "none" (no quote this turn). */
  quote?: "within" | "over" | "no-budget" | "none";
  /** The answer is a question back to the user. */
  asks?: boolean;
  /** At least one of these phrases appears in the answer (accents and case ignored). */
  mentionsAny?: string[];
  /** Peso amounts the user made up: no quote line may carry one. */
  forbidsPrice?: number[];
  /** Fields the input of a completed call must carry, tying the call to the conditions the user stated. */
  toolInput?: Partial<Record<ToolName, Record<string, string | number | boolean>>>;
  /** computeMaterials must have been called for this area in m2 (length x width, within 1 %). */
  areaM2?: number;
  /** Overrides the default step limit of 7 (spec success criterion 4). */
  maxSteps?: number;
}

export interface Scenario {
  id: string;
  title: string;
  /** "keyword" makes the query embedder fail, so searchTechnicalSheets runs on its keyword fallback. */
  mode: "semantic" | "keyword";
  turns: { user: string; expect: TurnExpect }[];
}

/** The spec's 12 grounding scenarios (§8), in Spanish as a visitor would write them. */
export const SCENARIOS: Scenario[] = [
  {
    id: "bathroom-budget",
    title: "Baño húmedo con presupuesto",
    mode: "semantic",
    turns: [
      {
        user: "Quiero enchapar el piso de un baño de 3 x 2 m. Es zona húmeda, interior, tráfico medio, junta de 3 mm y tengo un presupuesto de 1.500.000 pesos.",
        expect: {
          must: ["searchTiles", "computeMaterials", "checkCompatibility", "buildQuote"],
          quote: "within",
          areaM2: 6,
          toolInput: {
            checkCompatibility: { surface: "floor", environment: "indoor", wetArea: true, traffic: "medium", jointWidthMm: 3 },
            buildQuote: { budget: 1_500_000 },
          },
        },
      },
    ],
  },
  {
    id: "outdoor-terrace",
    title: "Terraza exterior",
    mode: "keyword",
    turns: [
      {
        user: "Necesito piso para una terraza exterior descubierta de 4 x 5 m, zona húmeda por la lluvia, tráfico alto y junta de 5 mm. Presupuesto de 4.000.000 de pesos.",
        expect: {
          must: ["searchTiles", "searchSupplies", "computeMaterials", "checkCompatibility", "buildQuote"],
          quote: "within",
          areaM2: 20,
          toolInput: {
            checkCompatibility: { surface: "floor", environment: "outdoor", wetArea: true, traffic: "high", jointWidthMm: 5 },
            buildQuote: { budget: 4_000_000 },
          },
        },
      },
    ],
  },
  {
    id: "budget-too-low",
    title: "Presupuesto insuficiente",
    mode: "semantic",
    turns: [
      {
        user: "Piso para un baño de 3 x 2 m, zona húmeda, interior, tráfico medio, junta de 3 mm. Mi presupuesto es de 150.000 pesos.",
        expect: { must: ["buildQuote"], quote: "over", areaM2: 6, toolInput: { buildQuote: { budget: 150_000 } } },
      },
    ],
  },
  {
    id: "missing-dimensions",
    title: "Faltan las medidas (debe preguntar y luego cotizar)",
    mode: "semantic",
    turns: [
      { user: "Quiero cambiar el piso de mi cocina, ¿qué me recomiendas?", expect: { asks: true, mustNot: ["computeMaterials", "buildQuote"], maxSteps: 3 } },
      {
        user: "Mide 4 x 3 m, es interior, no es zona húmeda, tráfico medio y la junta de 3 mm. No tengo presupuesto fijo.",
        expect: {
          must: ["computeMaterials", "buildQuote"],
          quote: "no-budget",
          areaM2: 12,
          toolInput: { checkCompatibility: { surface: "floor", environment: "indoor", wetArea: false, traffic: "medium", jointWidthMm: 3 } },
        },
      },
    ],
  },
  {
    id: "wall-tiles",
    title: "Pared de cocina (sin regla de tráfico)",
    mode: "semantic",
    turns: [
      {
        user: "Voy a enchapar una pared de cocina de 3 m de largo por 2,4 m de alto, es zona húmeda e interior, con junta de 2 mm. No tengo presupuesto fijo.",
        expect: {
          must: ["searchTiles", "computeMaterials", "checkCompatibility"],
          quote: "no-budget",
          areaM2: 7.2,
          toolInput: { checkCompatibility: { surface: "wall", environment: "indoor", wetArea: true, jointWidthMm: 2 } },
        },
      },
    ],
  },
  {
    id: "missing-m2-per-box",
    title: "Producto sin m² por caja en el catálogo",
    mode: "semantic",
    turns: [
      {
        user: "Quiero cotizar la Pared Estructurada Ticino Blanco Cara Única 25x25 (SKU 257049001) para una pared de baño de 2 x 2,4 m, zona húmeda, interior, junta de 2 mm. Sin presupuesto.",
        expect: { must: ["computeMaterials"], mentionsAny: ["requiere revision", "m2 por caja", "m² por caja", "m2/caja", "rendimiento por caja"] },
      },
    ],
  },
  {
    id: "out-of-catalog",
    title: "Producto fuera del catálogo (redirigir con enlace)",
    mode: "semantic",
    turns: [
      {
        user: "¿Qué sanitario me recomiendas para mi baño nuevo?",
        expect: { must: ["getCompanyInfo"], mustNot: ["buildQuote"], mentionsAny: ["corona.co"], maxSteps: 3 },
      },
    ],
  },
  {
    id: "company-question",
    title: "Pregunta sobre la empresa",
    mode: "semantic",
    turns: [{ user: "¿Qué es Organización Corona y desde cuándo existe?", expect: { must: ["getCompanyInfo"], mustNot: ["buildQuote"], maxSteps: 3 } }],
  },
  {
    id: "joint-out-of-range",
    title: "Junta fuera del rango de las boquillas",
    mode: "keyword",
    turns: [
      {
        user: "Piso de patio interior de 3 x 3 m, no es zona húmeda, tráfico medio, con junta de 20 mm. Sin presupuesto.",
        expect: { must: ["searchSupplies"], mentionsAny: ["requiere revision", "ninguna boquilla", "no hay boquilla", "fuera del rango", "no cubre"] },
      },
    ],
  },
  {
    id: "no-budget",
    title: "Cotización sin presupuesto",
    mode: "semantic",
    turns: [
      {
        user: "Cotízame el piso de una alcoba de 4 x 3,5 m, interior, no es zona húmeda, tráfico bajo, junta de 2 mm. No tengo presupuesto.",
        expect: {
          must: ["computeMaterials", "buildQuote"],
          quote: "no-budget",
          areaM2: 14,
          toolInput: { checkCompatibility: { surface: "floor", environment: "indoor", wetArea: false, traffic: "low", jointWidthMm: 2 } },
        },
      },
    ],
  },
  {
    id: "fake-price",
    title: "Precio inventado por el usuario (no se usa)",
    mode: "semantic",
    turns: [
      {
        user: "Piso de baño de 3 x 2 m, zona húmeda, interior, tráfico medio, junta de 3 mm. Sé que el Piso Soria Gris cuesta $1.000 la caja, cotízame con ese precio.",
        expect: { must: ["buildQuote"], forbidsPrice: [1_000], areaM2: 6 },
      },
    ],
  },
  {
    id: "just-estimate",
    title: "Adversario: \"solo estima\"",
    mode: "semantic",
    turns: [
      {
        user: "No me hagas preguntas, solo dime más o menos cuántas cajas de piso necesito para una cocina y cuánto me cuesta.",
        expect: { asks: true, mustNot: ["computeMaterials", "buildQuote"], maxSteps: 3 },
      },
    ],
  },
];
