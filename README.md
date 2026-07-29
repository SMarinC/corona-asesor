# Corona Asesor — Agente de revestimientos

Agente de IA que ayuda a planear la instalación de **pisos y paredes** y sus
**pegantes y boquillas** con productos de **Corona Colombia**. Entiende el
proyecto del usuario, pide lo que falta, consulta el catálogo real, calcula
cantidades, valida compatibilidad, valida el presupuesto y explica la
recomendación **con evidencia técnica**.

> Proyecto para **AgentSprint by ReshapeX**. Diseñado para llegar a
> **Progress nivel 4**: todas las respuestas *grounded* por herramientas de
> conocimiento (el agente no inventa).

---

## Arquitectura

Un **único agente orquestador** (Google / Gemini) que coordina herramientas:

| Capa | Tecnología | Responsabilidad |
|------|-----------|-----------------|
| Razonamiento | Gemini (function calling) | Entiende al usuario, planea, explica |
| Datos exactos | **DuckDB** | Qué productos cumplen filtros, precios, disponibilidad, m²/caja |
| Evidencia | **ChromaDB** | Búsqueda semántica sobre fragmentos de fichas técnicas (RAG) |
| Compatibilidad | Motor de reglas | Compatible / Incompatible / Requiere revisión |
| Cantidades | Funciones deterministas | Área, desperdicio, cajas, pegante, boquilla, presupuesto |
| UI | Streamlit | Chat + traza de herramientas (observabilidad) |

Separación de responsabilidades: **DuckDB** filtra, **Chroma** justifica, el
**motor de reglas** valida, los **cálculos** cuantifican y el **LLM** entiende y
explica. Cada componente es verificable en ejecución (no solo mencionado).

```
corona-agent/
├── app.py                     # UI Streamlit (demo)
├── run_ingest.py              # Carga JSON→DuckDB y fichas→Chroma
├── .env.example               # Plantilla de variables (sin secretos)
├── data/
│   ├── raw/                   # JSON estructurado (revestimientos, pegantes, boquillas)
│   ├── fichas/                # Fragmentos de fichas técnicas (fichas.json / *.txt)
│   └── processed/             # Artefactos generados (corona.duckdb, chroma/)
├── src/
│   ├── config.py              # Configuración desde .env
│   ├── agent/                 # Orquestador, tools, prompt, estado
│   ├── knowledge/             # DuckDB, Chroma, ingesta
│   ├── rules/                 # Motor de reglas de compatibilidad
│   └── calc/                  # Cálculos deterministas
├── docs/demo_script.md        # Guion de la demo
└── tests/                     # Tests de cálculos y reglas
```

---

## Puesta en marcha

```bash
# 1) Dependencias
pip install -r requirements.txt

# 2) Variables de entorno
cp .env.example .env
#   edita .env: GOOGLE_API_KEY (obligatoria) y VOYAGE_API_KEY (para RAG semántico)

# 3) La base ya viene construida en data/processed/. Verifícala:
python run_ingest.py          # -> DuckDB: OK products=505 · Chroma: OK fragmentos=3754

# 4) Correr la demo
streamlit run app.py
```

Correr los tests (no requieren API key):

```bash
pytest -q
```

---

## Datos: base ya construida

El equipo de datos entrega la base **ya hecha** (no hay que ingestar):

- `data/processed/corona.duckdb` — una tabla **`products`** (505 filas). Los
  atributos técnicos viven en un JSON `specifications`; la capa `duckdb_store.py`
  los **normaliza** (deriva interior/exterior y humedad desde *Áreas de uso*,
  tráfico desde *Uso*, y parsea el formato del nombre).
- `data/processed/chroma/` — colección **`corona_fichas`** (3.754 fragmentos de
  fichas técnicas, embeddings **VoyageAI `voyage-4-large`**). Metadatos por
  fragmento: `sku, category, subcategory, section, pdf_id`.

Categorías reales: `Revestimientos` (subcategorías `Pisos` / `Paredes`),
`Pegantes`, `Boquillas`.

> ⚠️ La base está en `.gitignore` (son ~58 MB de binarios). Consíguela del
> equipo de datos y déjala en `data/processed/`. La demo la lee de ahí.

### Qué trae y qué NO trae el catálogo (y cómo lo maneja el agente)
- **Sí:** categoría, subcategoría, precio (revestimientos casi siempre; pegantes
  y boquillas de forma parcial), disponibilidad, acabado, diseño, áreas de uso,
  presentación (kg) y rango de junta (derivado de la subcategoría).
- **No:** m² por caja, ni rendimiento numérico del pegante/boquilla (viene como
  texto: *"ir a ficha técnica…"*). Cuando falta un dato, el cálculo NO se
  inventa: devuelve **"Requiere revisión"** y apunta a `buscar_evidencia`, que
  recupera el dato de la ficha técnica (Chroma). Con `VOYAGE_API_KEY` la búsqueda
  es semántica; sin ella, cae a un **fallback por palabra clave** que igual
  muestra evidencia.

---

## Cómo evita alucinaciones (grounding)

- El LLM **no** produce números ni precios de memoria: área, cajas, kg de
  pegante/boquilla, costos y presupuesto se calculan con funciones deterministas.
- Productos, precios y disponibilidad salen de **DuckDB**.
- Las justificaciones citan fragmentos reales de fichas desde **Chroma**.
- Si falta un dato, el resultado se marca **"Requiere revisión"** en vez de
  inventarlo.
- La UI muestra la **traza de herramientas** de cada respuesta: se puede auditar
  qué consultó y calculó el agente.

---

## Capacidades adicionales

- **Consultas generales de Corona.** El contexto institucional
  (`data/contexto_agente.json`: empresa, contacto, garantías, financiación,
  tiendas, categorías fuera de catálogo con sus links) se **inyecta en el system
  prompt** (`prompts.py`), no es RAG. Así el agente responde temas generales al
  instante y, ante una categoría fuera del catálogo (sanitarios, griferías,
  pinturas…), **redirige con el link real en vez de decir "no"**.
- **Imágenes de producto.** El normalizador expone `imagen`/`imagenes` (368/505
  productos traen foto). El agente las muestra con markdown `![](url)` y Streamlit
  las renderiza.
- **Links de producto.** Cada producto trae `url`; el agente **pregunta** si los
  quieres antes de listarlos.
- **Cotización en PDF.** La herramienta `generar_cotizacion_pdf`
  (`src/output/cotizacion.py`, fpdf2) crea un PDF con el desglose, total y
  validación de presupuesto; la UI muestra un botón de descarga. Los PDF se
  guardan en `data/cotizaciones/`.
- **Estilo sin emojis**, profesional, definido en el system prompt.

## Componentes de agente implementados (Technical Checklist)

1. **LLM / razonamiento** — Claude como orquestador.
2. **Tool use / function calling** — 12 herramientas reales (búsqueda, cálculo,
   reglas, evidencia RAG y generación de cotización PDF).
3. **Knowledge tools / RAG** — DuckDB (estructurado) + Chroma (semántico).
4. **Planning / orquestación** — loop multi-paso que encadena las herramientas.
5. **Guardrails + Observabilidad** — política "no inventar" + traza auditable.

---

## Seguridad

- Secretos solo en `.env` (ignorado por git). Nunca hardcodeados.
- `.env.example` documenta las variables sin valores reales.
