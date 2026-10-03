export interface Suggestion {
  title: string;
  prompt: string;
}

/** Fully specified projects, so a first visit goes straight to a quote. They mirror grounding-eval scenarios. */
export const SUGGESTIONS: Suggestion[] = [
  {
    title: "Piso de baño con presupuesto",
    prompt:
      "Quiero enchapar el piso de un baño de 3 x 2 m. Es zona húmeda, interior, tráfico residencial normal, junta de 3 mm y tengo un presupuesto de 1.500.000 pesos.",
  },
  {
    title: "Terraza exterior",
    prompt: "Necesito piso para una terraza exterior descubierta de 4 x 5 m, con tráfico alto y junta de 5 mm. ¿Qué me recomiendas y cuánto cuesta?",
  },
  {
    title: "Pared de cocina",
    prompt: "Voy a enchapar una pared de cocina de 3 m de largo por 2,4 m de alto, es zona húmeda e interior, con junta de 2 mm. No tengo presupuesto fijo.",
  },
];
