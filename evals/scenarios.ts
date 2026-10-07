import { getCompanyContext } from "@/lib/data/company";
import type { ToolName } from "@/lib/ui/tool-parts";

/**
 * What the whole conversation must show, checked once after its last turn. Every turn also gets the per-turn
 * checks: it completed, at most 7 steps, money only from tools or the customer, computed quantities, catalog
 * prices, and "requiere revisión" when a tool asked for review.
 */
export interface ScenarioExpect {
  /** Tools that must finish without an error somewhere in the conversation. */
  calls?: ToolName[];
  /** Fields that some finished call of the tool must carry: the customer's conditions reached the tools. */
  inputs?: Partial<Record<ToolName, Record<string, string | number | boolean>>>;
  /** computeMaterials ran for this area in m² (length × width, within 1 %). */
  areaM2?: number;
  /** The last quote's budget verdict, as buildQuote's withinBudget gave it. */
  quote?: "within" | "over";
  /** A word the answer that presented the last quote must contain (accents and case ignored); the verdict is `quote`'s job. */
  quoteMentions?: string;
  /** A SKU, as the catalog stores it, that the last quote must list, with no unknown_sku error on the way. */
  resolvesSku?: string;
  /** The out-of-catalog link the answer must share, with no catalog tool call. */
  link?: string;
  /** The first buildQuote that ran is in turn 3 or later: tiles, then supplies, then the quote, each in its own turn. */
  staged?: true;
}

export interface ScenarioTurn {
  user: string;
  /** The agent must ask for the missing data: no catalog tool call, and no money amount or quantity with a unit. */
  asks?: true;
}

export interface Scenario {
  id: string;
  title: string;
  /** "keyword" makes the query embedder fail, so searchTechnicalSheets runs on its keyword fallback. */
  mode: "semantic" | "keyword";
  turns: ScenarioTurn[];
  expect: ScenarioExpect;
}

// Generic replies: they move any proposal forward, whatever the model proposed. The joint width is in the first
// message, because the catalog has no recommended joint and the prompt asks the customer for it.
const PICK = { user: "El primero que propones." };
// Confirms the adhesive and grout: "lo que recomiendas" stays unambiguous when the model lists several options.
const AGREE = { user: "Sí, de acuerdo con lo que recomiendas." };
const CONFIRM = { user: "Confirmo." };

/** The link the prompt gives for an out-of-catalog product, read from the same company data. */
function outOfCatalogUrl(nombre: string): string {
  const { productos } = getCompanyContext().categorias_fuera_de_catalogo as { productos: { nombre: string; url: string }[] };
  const url = productos.find((p) => p.nombre === nombre)?.url;
  if (!url) throw new Error(`company-context.json has no out-of-catalog product "${nombre}"`);
  return url;
}

/**
 * The staged flow (space → tile → joint → adhesive and grout → quote → confirmation), one real risk per scenario.
 * The full flows come first and the short ones last: the runner reserves a whole scenario's worst case before
 * starting it. Each full flow has 4 turns: the stage gate allows the quote in turn 3 at the earliest, so a model that
 * spends one turn on a question still reaches it.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "bathroom-budget",
    title: "Baño húmedo con presupuesto, de principio a fin",
    mode: "semantic",
    turns: [
      { user: "Quiero enchapar el piso de un baño de 3 x 2 m. Es zona húmeda, interior, tráfico medio, junta de 3 mm y tengo un presupuesto de 1.500.000 pesos." },
      PICK,
      AGREE,
      CONFIRM,
    ],
    expect: {
      calls: ["searchTiles", "searchSupplies"],
      inputs: {
        checkCompatibility: { surface: "floor", environment: "indoor", wetArea: true, traffic: "medium", jointWidthMm: 3 },
        computeMaterials: { jointWidthMm: 3 },
        buildQuote: { budget: 1_500_000 },
      },
      areaM2: 6,
      quote: "within",
      staged: true,
    },
  },
  {
    id: "outdoor-terrace",
    title: "Terraza exterior: las condiciones llegan a las tools",
    mode: "keyword",
    turns: [
      { user: "Necesito piso para una terraza exterior descubierta de 4 x 5 m, zona húmeda por la lluvia, tráfico alto y junta de 5 mm. Presupuesto de 4.000.000 de pesos." },
      PICK,
      AGREE,
      CONFIRM,
    ],
    expect: {
      inputs: {
        checkCompatibility: { surface: "floor", environment: "outdoor", wetArea: true, traffic: "high", jointWidthMm: 5 },
        computeMaterials: { jointWidthMm: 5 },
        buildQuote: { budget: 4_000_000 },
      },
      areaM2: 20,
      staged: true,
    },
  },
  {
    id: "wall-tiles",
    title: "Pared de cocina con un SKU que termina en punto",
    mode: "semantic",
    turns: [
      {
        user: "Quiero enchapar una pared de cocina de 3 m de largo por 2,4 m de alto con la Pared Lunea Blanco 25x40 (SKU 401072001). Es interior y zona húmeda, con junta de 2 mm. No tengo presupuesto fijo.",
      },
      AGREE,
      CONFIRM,
      CONFIRM,
    ],
    expect: {
      inputs: {
        checkCompatibility: { surface: "wall", environment: "indoor", wetArea: true, jointWidthMm: 2 },
        computeMaterials: { jointWidthMm: 2 },
      },
      areaM2: 7.2,
      resolvesSku: "401072001.",
      staged: true,
    },
  },
  {
    id: "budget-too-low",
    title: "Presupuesto insuficiente",
    mode: "semantic",
    turns: [
      { user: "Piso para un baño de 3 x 2 m, zona húmeda, interior, tráfico medio, junta de 3 mm. Mi presupuesto es de 150.000 pesos." },
      PICK,
      AGREE,
      CONFIRM,
    ],
    expect: { inputs: { buildQuote: { budget: 150_000 } }, quote: "over", quoteMentions: "presupuesto", staged: true },
  },
  {
    id: "fake-price",
    title: "Precio inventado por el cliente",
    mode: "semantic",
    turns: [
      { user: "Piso de baño de 3 x 2 m, zona húmeda, interior, tráfico medio, junta de 3 mm. Sé que el Piso Soria Gris cuesta $1.000 la caja, cotízame con ese precio." },
      AGREE,
      CONFIRM,
      CONFIRM,
    ],
    // A quote must be built; the per-turn catalog-prices and money-from-tools checks then catch the fake price.
    expect: { calls: ["buildQuote"], staged: true },
  },
  {
    id: "missing-dimensions",
    title: "Faltan las medidas: pregunta y luego propone revestimientos",
    mode: "semantic",
    turns: [
      { user: "Quiero cambiar el piso de mi cocina, ¿qué me recomiendas?", asks: true },
      { user: "Mide 4 x 3 m, es interior, no es zona húmeda, tráfico medio y la junta de 3 mm. No tengo presupuesto fijo." },
    ],
    expect: { calls: ["searchTiles"] },
  },
  {
    id: "out-of-catalog",
    title: "Producto fuera del catálogo: enlace y ninguna búsqueda",
    mode: "semantic",
    turns: [{ user: "¿Qué sanitario me recomiendas para mi baño nuevo?" }],
    expect: { link: outOfCatalogUrl("Sanitarios") },
  },
  {
    id: "just-estimate",
    title: "\"Dame solo un estimado\" sin datos",
    mode: "semantic",
    turns: [{ user: "No me hagas preguntas, dame solo un estimado de cuántas cajas de piso necesito para una cocina y cuánto me cuesta.", asks: true }],
    expect: {},
  },
];
