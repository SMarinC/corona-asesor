# Guion de demo — Corona Asesor

> Objetivo: mostrar en ~3 min una **planeación completa de revestimiento**,
> con todas las respuestas *grounded* por herramientas (Progress nivel 4).

## Narrativa (problema → solución → demo → impacto)

**Problema (30s).** Comprar piso o enchape es un campo minado: la gente no sabe
qué producto sirve para su espacio, cuántas cajas comprar, qué pegante y boquilla
son compatibles, ni cuánto de cada uno. Terminan comprando de más, de menos, o
combinaciones que fallan.

**Solución (30s).** Corona Asesor es un **agente** (no un buscador): entiende el
proyecto, pide lo que falta, consulta el catálogo real, calcula cantidades,
valida compatibilidad y entrega una propuesta explicada con evidencia técnica.
No inventa: cada número y cada precio sale de una herramienta.

**Demo en vivo (90s).** Escribir en el chat:

> "Necesito cambiar el piso de una cocina de 4 por 3 metros. Quiero un diseño
> claro, fácil de limpiar y tengo un presupuesto de 2.500.000 pesos."

Mostrar cómo el agente:
1. Calcula el área → 12 m², con 10% desperdicio → 13.2 m² (`calcular_area`).
2. Busca revestimientos claros de interior dentro del presupuesto
   (`buscar_revestimientos` → productos reales, con precio y SKU).
3. Elige el producto y valida la combinación (`validar_compatibilidad` →
   Compatible, con desglose ambiente/humedad/tráfico/pegante/junta).
4. Selecciona pegante y boquilla compatibles (`buscar_pegantes`, `buscar_boquillas`).
5. Recupera de la ficha técnica el rendimiento / m² por caja que el catálogo no
   trae (`buscar_evidencia`) y con eso completa las cantidades.
6. Suma el costo y valida el presupuesto (`calcular_presupuesto`).

> **Punto fuerte para los jueces (grounding honesto):** cuando el catálogo no
> tiene m² por caja o el rendimiento del pegante, el agente NO inventa: marca
> **"Requiere revisión"** y va a la ficha técnica (Chroma) por el dato. Abrir el
> expander **"🔧 Herramientas usadas"** para mostrar la llamada real y su
> resultado — esa es la prueba de que no hay alucinación.

> Para la búsqueda semántica en fichas, tener `VOYAGE_API_KEY` en el `.env`
> (la colección usa embeddings VoyageAI). Sin ella funciona el fallback por
> palabra clave.

**Impacto (30s).** El usuario pasa de la duda a una lista de compra exacta y
justificada en segundos. Para Corona: menos devoluciones, mejor experiencia y
un asesor experto disponible 24/7.

## ¿Por qué es diferente? (una línea para Innovation)
No es un chatbot que "habla" del catálogo: es un agente que **planea la obra
completa** — cantidades, compatibilidad y presupuesto — y **muestra la evidencia**
de cada decisión.

## Posibles preguntas de los jueces (y respuesta)
- **¿Y si no está en la base?** No lo inventa: lo marca como "Requiere revisión".
- **¿Los precios son reales?** Salen de DuckDB (catálogo), no del modelo.
- **¿Cómo evitan alucinaciones?** El LLM no calcula ni cita de memoria: todo pasa
  por herramientas deterministas y por RAG sobre las fichas. La traza lo prueba.
- **¿Qué componentes de agente tienen?** LLM + tool use + RAG (DuckDB/Chroma) +
  orquestación multi-paso + guardrails ("no inventar") + observabilidad (traza).

## Checklist antes de presentar
- [ ] `.env` con `ANTHROPIC_API_KEY` cargada.
- [ ] `python run_ingest.py` corrido (DuckDB + Chroma con datos).
- [ ] `streamlit run app.py` abre sin errores.
- [ ] Consulta de ejemplo ensayada de principio a fin.
- [ ] Expander de herramientas visible para mostrar el grounding.
