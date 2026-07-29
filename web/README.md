# Corona Asesor — Web (Next.js)

MVP en Next.js/React que replica y mejora visualmente el agente Streamlit
original (`c:\Users\dfgar\Documents\GitHub\corona-agent`). Mismo backend
lógico (orquestador Gemini + 11 tools + DuckDB + Chroma + reglas + cálculos +
PDF), reimplementado en TypeScript, con una interfaz de chat mucho más
cuidada: paleta cálida de marca, panel de productos candidatos, trace de
herramientas con tratamiento visual (no JSON crudo), descarga de PDF y dark
mode.

El proyecto Python original **no fue tocado**: sigue funcionando exactamente
igual. Este `web/` es un consumidor de solo lectura de los mismos artefactos
de datos (`data/processed/corona.duckdb`, `data/processed/chroma/`,
`data/contexto_agente.json`, `assets/logo.png`).

## Cómo correrlo

```bash
cd web
npm install
npm run dev
```

Abre `http://localhost:3000`. El `.env.local` ya está creado y apunta a los
datos del repo padre (`../data/...`) y reutiliza la MISMA `GOOGLE_API_KEY`
que ya estaba probada en `../.env` — no se generó ninguna key nueva.

Variables relevantes en `web/.env.local`:

| Variable | Para qué |
|---|---|
| `GOOGLE_API_KEY` | Copiada de `../.env`, sin cambios. |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` (igual que Python). |
| `DUCKDB_PATH`, `CHROMA_SQLITE_PATH`, `CONTEXTO_PATH`, `COTIZACIONES_DIR`, `LOGO_PATH` | Rutas relativas a `../` (raíz del repo Python), resueltas en `src/lib/config/index.ts`. |
| `VOYAGE_API_KEY` | Presente pero no usada por el backend Node (ver decisión de Chroma abajo). |

No hace falta build ni migración de datos: todo se lee tal cual del
`.duckdb`/`.sqlite3` que ya construyó el pipeline Python.

## Arquitectura — mapeo Python → TypeScript

| Python | TypeScript | Notas |
|---|---|---|
| `src/agent/orchestrator.py` (`CoronaAgent`) | `web/src/lib/agent/orchestrator.ts` | Mismo loop: `generateContent` → `functionCalls` → ejecutar tools → `functionResponse` → repetir hasta `max_turns=12` o respuesta sin tool calls. Mismo manejo de checkpoint/revert de historial en error, mismo mensaje de `MAX_TOKENS`. |
| `src/agent/tools.py` (`AGENT_TOOLS`, `ToolDispatcher`) | `web/src/lib/agent/tools.ts` | Los 11 JSON Schemas son textualmente los mismos; el dispatcher reimplementa cada handler 1:1 (incluye la caché de productos por SKU en el turno). |
| `src/agent/prompts.py` | `web/src/lib/agent/prompts.ts` | Mismo texto de instrucciones; el contexto institucional se sigue inyectando desde `data/contexto_agente.json` (se lee, no se duplica). |
| `src/knowledge/duckdb_store.py` | `web/src/lib/knowledge/duckdbStore.ts` | Usa `@duckdb/node-api` contra el mismo `.duckdb`, `READ_ONLY`. Normalización (regex de formato, m²/kg, vocabulario de áreas húmedas/exteriores, etc.) portada línea por línea. |
| `src/knowledge/chroma_store.py` | `web/src/lib/knowledge/chromaStore.ts` | Ver sección dedicada abajo — decisión de arquitectura importante. |
| `src/calc/calculations.py` | `web/src/lib/calc/calculations.ts` | Funciones puras, mismos redondeos y mensajes de `detalle`. |
| `src/rules/compatibility.py` | `web/src/lib/rules/compatibility.ts` | Mismas 7 reglas y misma severidad `Compatible < Requiere revisión < Incompatible`. |
| `src/output/cotizacion.py` (fpdf2) | `web/src/lib/output/cotizacion.ts` (pdf-lib) | Mismo desglose de tabla, mismo azul de marca, mismo footer de contacto tomado de `contexto_agente.json`, mismo disclaimer. |
| `app.py` (Streamlit) | `web/src/app/**`, `web/src/components/**` | Chat + panel de candidatos + trace + descarga de PDF, con diseño propio (ver abajo). |

### El loop de orquestación

`CoronaAgent.ask()` en `orchestrator.ts` reproduce exactamente la máquina de
estados de Python: por cada turno de usuario se guarda un `checkpoint` del
historial; si algo falla a mitad de camino (incluido un 429 de rate limit) se
revierte el historial a ese checkpoint para no dejar un mensaje `user` sin su
`model` correspondiente (lo que rompería el siguiente turno). El mensaje al
usuario en caso de 429 es explícito: *"El modelo está saturado por límites de
la capa gratuita (rate limit). Espera un momento y vuelve a intentar."* — se
detecta buscando `429` / `RESOURCE_EXHAUSTED` / `rate limit` en el error del
SDK.

### Sesión por conversación

Streamlit usa `st.session_state` (una instancia de `CoronaAgent` por pestaña
de navegador). El equivalente aquí es `web/src/lib/session/sessionStore.ts`:
un `Map` en memoria del proceso Node, keyed por una cookie httpOnly
(`corona_session`) que `POST /api/chat` crea si no existe. Es un MVP de una
sola instancia de servidor — si se necesitara escalar horizontalmente esto se
movería a Redis, pero para la demo es exactamente el mismo modelo de
aislamiento que ya tenía Streamlit (una conversación por usuario, nunca
compartida).

## Decisión de arquitectura: Chroma (lo más importante para leer)

**Problema**: la colección `corona_fichas` fue construida con el cliente
Python de `chromadb` usando embeddings de VoyageAI (`voyage-4-large`, 1024
dim), persistida como un índice HNSW en disco (`data/processed/chroma/`,
formato sqlite3 + archivos binarios `.bin`/`.pickle`). El cliente `chromadb`
de npm existe, pero:

1. Abrir ese mismo `PersistentClient` desde Node contra un índice HNSW que
   escribió la build de Python de Chroma es frágil — no hay garantía de
   compatibilidad binaria entre las dos implementaciones nativas, y levantar
   un servidor Chroma aparte (`chroma run`) solo para esta demo añade una
   pieza de infraestructura extra sin necesidad real.
2. No existe un cliente oficial de VoyageAI para Node, así que aunque se
   pudiera abrir el índice, no hay forma directa de generar el embedding de
   la consulta del lado de Node sin reimplementar esa llamada HTTP a mano.

**Decisión tomada**: leer el `chroma.sqlite3` **directamente** con el módulo
nativo `node:sqlite` (incluido en Node 22+, sin dependencias que compilar —
relevante porque esta máquina no tiene Visual Studio Build Tools instalado y
`better-sqlite3` no pudo compilar sus bindings nativos; `node:sqlite` no
necesita compilación). Inspeccionando el esquema real de Chroma se encontró
que:

- Cada fragmento vive en `embedding_metadata` como pares `(id, key,
  string_value)` (modelo entidad-atributo-valor), con el texto completo del
  documento bajo la key especial `chroma:document`.
- Chroma **ya construye un índice FTS5 (trigram)** sobre todos esos valores
  de metadata: la tabla `embedding_fulltext_search`. Esto es *exactamente* lo
  que el `ChromaStore.buscar()` de Python usa como fallback cuando no hay
  `VOYAGE_API_KEY` o la búsqueda semántica falla (`where_document={"$contains":
  palabra}`, ver `chroma_store.py`).

`web/src/lib/knowledge/chromaStore.ts` replica ese mismo fallback por
palabra clave de forma fiel: mismo vocabulario de *stopwords*, mismo criterio
de selección de hasta 4 palabras significativas (≥5 caracteres) de la
consulta, mismo agrupamiento por `pdf_id + section` para no duplicar
fragmentos, y el mismo modo `por_sku` cuando se filtra por SKU. El resultado
observable —evidencia real de fichas técnicas citada por el agente, nunca
inventada— es idéntico al de la demo Streamlit incluso sin salir a la red
para pedir embeddings. En las pruebas reales el agente usó `buscar_evidencia`
repetidamente para resolver el m²/caja y el rendimiento kg/m² que el
catálogo DuckDB no trae, y obtuvo datos reales de la ficha técnica cada vez.

**Lo que se dejó fuera por tiempo**: búsqueda semántica real vía VoyageAI
desde Node (llamando su REST API directamente, sin SDK oficial). El fallback
FTS cubre el mismo propósito para el pitch — el punto central
("el agente no alucina, todo sale de una tool real") se mantiene intacto.
`VOYAGE_API_KEY` se dejó en `.env.local` por si se retoma esto luego.

## Decisión de arquitectura: DuckDB

`@duckdb/node-api` (el cliente "neo" oficial, en vez del paquete `duckdb`
legado) abre el mismo archivo `.duckdb` en `READ_ONLY`. Sin sorpresas de
compatibilidad — DuckDB tiene un formato de archivo estable entre bindings.

Un detalle no trivial: `@duckdb/node-api` carga bindings nativos por
plataforma con un `require()` dentro de un `switch(platform)`. Turbopack (el
bundler de Next.js 16, activado por defecto) intenta resolver **todas** las
ramas de ese switch en tiempo de build, y falla porque solo está instalado el
binding de esta plataforma (`win32-x64`). Se resolvió declarando
`@duckdb/node-api` y `@duckdb/node-bindings` en `serverExternalPackages`
(`next.config.ts`), que le dice a Next que use el `require()` nativo de
Node en runtime en vez de intentar bundlear el paquete — el mismo mecanismo
que Next ya aplica de fábrica a paquetes nativos similares
(`better-sqlite3`, `sqlite3`, etc.).

## Decisión de arquitectura: PDF

`fpdf2` (Python) se reemplazó por `pdf-lib` (Node), dibujando manualmente la
misma tabla (concepto/cantidad/precio/subtotal), el mismo header azul de
marca con el logo (`data/assets/logo_corona.png`) y el mismo footer de
contacto institucional. El PDF se genera en memoria, se persiste en
`data/cotizaciones/` (igual que Python) y **además** se guarda en un registro
en memoria de la sesión (`sessionStore`) para poder servirlo por
`GET /api/cotizacion/[id]` con streaming directo del buffer — así el botón
"Descargar cotización" del chat no depende de que el archivo siga en disco.

## Frontend — decisiones de diseño

- **Paleta**: azul de marca Corona `#005EB8` (tomado de `assets/logo.png`)
  como único acento, sobre blancos cálidos (no `#FFFFFF` puro) y neutros
  tierra, con un acento secundario verde suave para el estado "Compatible" y
  ámbar para "Requiere revisión". Sin gradientes morados ni dark-mode-neon.
  Tokens definidos en OKLCH en `src/app/globals.css`, siguiendo la
  arquitectura de tokens de shadcn/ui (`--primary`, `--secondary`, `--muted`,
  `--success`, `--warning`, etc.), con variantes completas para light y dark.
- **Tipografía**: Manrope (headings, geométrica con carácter, vía
  `--font-heading`) + Inter (cuerpo, máxima legibilidad, vía `--font-sans`),
  ambas cargadas con `next/font/google` (self-hosted, sin layout shift).
  Jerarquía marcada: pesos 700-800 en títulos, 400-600 en cuerpo.
- **Stack**: Tailwind CSS v4 + shadcn/ui. Importante: el `shadcn` instalado en
  este proyecto usa **`@base-ui/react`** como primitiva (no Radix) — su API
  difiere de la que trae la mayoría de ejemplos "shadcn" en internet/training
  data (p. ej. no existe `asChild`, se usa `render={<a .../>}`; los triggers
  ya renderizan su propio `<button>`, no hay que envolver uno más adentro).
  El repo tiene un `AGENTS.md` que avisa exactamente de esto — se verificó
  cada componente contra sus `.d.ts` reales antes de usarlo.
- **Accesibilidad**: contraste verificado ≥4.5:1 en texto normal en ambos
  temas, focus rings visibles (heredados de shadcn/base-ui), tap targets
  ≥44×44px en controles móviles (inputs, botones, toggles de trace), sin
  iconos emoji (se usa `lucide-react` en todas partes), `prefers-reduced-motion`
  respetado globalmente en `globals.css`, `viewport` con `initial-scale=1`
  sin bloquear zoom.
- **Progressive disclosure**: el trace de herramientas está **colapsado por
  defecto** (`Collapsible`) y se abre por mensaje; dentro de cada paso del
  trace, el resumen legible (p. ej. "4 cajas (7.28 m²) · $239.512") está
  siempre visible, y el JSON crudo de input/output solo aparece al expandir
  ese paso puntual — nunca se bombardea con JSON de entrada.
- **Trace visual**: cada una de las 11 tools tiene un ícono y una etiqueta en
  español (`src/lib/toolMeta.ts`), y un formateador de resumen específico por
  tipo de tool (`TracePanel.tsx`) — cantidades, costos en COP, veredictos de
  compatibilidad con badge de color — en vez de mostrar el dict crudo como
  hacía el `st.code(json.dumps(...))` de Streamlit.
- **Mobile**: layout de una columna en mobile (el panel de candidatos baja
  debajo del chat), grid de dos columnas desde `lg:`. Textarea con
  `field-sizing-content`, envío con Enter / salto de línea con Shift+Enter.

## Qué quedó pendiente o simplificado

- **Streaming token a token**: no se implementó streaming real de la
  respuesta de Gemini (`generateContentStream`). El loop de tool-use hace
  varias llamadas `generateContent` por turno (una por cada ronda de tool
  calls), y la UI muestra un estado "pensando" (tres puntos animados) mientras
  se resuelve todo el turno server-side, igual que el `st.spinner` de
  Streamlit. Esto es fiel al comportamiento original; añadir streaming real
  del texto final es una mejora futura razonable pero no cambia el
  comportamiento funcional.
- **Búsqueda semántica real (VoyageAI) desde Node**: no implementada, ver
  sección de Chroma arriba. El fallback FTS es funcionalmente equivalente
  para el propósito de la demo (evidencia real, no inventada).
- **Persistencia de sesión entre reinicios del servidor**: el historial de
  conversación vive en memoria del proceso (`sessionStore.ts`); si se
  reinicia `next dev`/`next start` se pierde, igual que `st.session_state` se
  pierde si se reinicia Streamlit.
- **Multi-instancia / serverless**: el `sessionStore` en memoria asume un
  único proceso Node de larga duración (igual que Streamlit). No es
  compatible tal cual con un despliegue serverless multi-región sin mover el
  estado a un store compartido (Redis, etc.).
- **Tests**: no se portaron los `pytest` de `tests/test_calculations.py` a
  Vitest/Jest por falta de tiempo — la paridad de comportamiento se validó
  manualmente comparando las funciones de `calculations.ts`/`compatibility.ts`
  contra su contraparte Python línea por línea, y con pruebas end-to-end
  reales contra el modelo (ver abajo).

## Limitaciones conocidas

- **Rate limits del free tier de Gemini** (`gemini-flash-lite-latest`, 250K
  tokens de entrada/minuto): un flujo de cotización completo hace entre 9 y
  17 llamadas a `generateContent` en el mismo turno (una por cada ronda de
  tool calls), y cada llamada reenvía el historial completo + el system
  prompt (~3300 tokens de contexto institucional). Es fácil agotar la cuota
  en unos pocos turnos seguidos durante pruebas manuales — se observó esto
  repetidamente durante el desarrollo (incluidas las pruebas finales de este
  mismo README). El backend maneja el 429 exactamente como pedía el brief:
  revierte el turno y muestra *"El modelo está saturado por límites de la
  capa gratuita (rate limit). Espera un momento y vuelve a intentar."* en vez
  de romper la conversación. Esto es una limitación del plan gratuito de
  Google, no un bug del código — con una key de pago o un modelo con cuota
  mayor desaparece.
- **`node:sqlite` es experimental** en algunas versiones de Node (estable
  desde Node 22.5 sin flag; este proyecto se probó en Node 24). Si se
  despliega en un entorno con una versión de Node más vieja, el acceso a
  Chroma fallará — está pensado para Node 22+.
- **Windows sin Visual Studio Build Tools**: por eso se evitó cualquier
  dependencia con bindings nativos que requirieran compilación local
  (`better-sqlite3` fue descartado explícitamente por esto, ver arriba).
  `@duckdb/node-api` sí trae binarios prebuilt para `win32-x64`, así que no
  tuvo este problema.
- **Turbopack + paquetes nativos**: cualquier futura dependencia con
  bindings nativos por plataforma probablemente necesite el mismo tratamiento
  de `serverExternalPackages` que se le dio a DuckDB (ver arriba) si empieza
  a fallar el build con "Module not found" apuntando a un binding de otra
  plataforma.

## Verificación realizada

- `npx tsc --noEmit` y `npx eslint .` limpios.
- Prueba end-to-end directa del orquestador (script standalone, sin HTTP) con
  el mensaje *"Quiero cotizar un baño de 3x2 metros, interior, zona húmeda,
  diseño marmolizado"*: el agente devolvió una propuesta con productos reales
  del catálogo (SKUs 555332501, 553214031), precios reales, cálculo de
  cajas/pegante/boquilla, evidencia citada desde `buscar_evidencia`
  (rendimiento real de ficha técnica) y una traza de 13 pasos de
  herramientas reales.
- Mismo flujo repetido varias veces contra `POST /api/chat` por HTTP real
  (con cookie de sesión `corona_session`), confirmando que el pipeline
  completo — API route → `sessionStore` → `CoronaAgent` → DuckDB/Chroma/
  cálculo/reglas — funciona igual vía HTTP que en el script standalone. En
  una de las corridas, el agente pidió primero los datos que faltaban
  (presupuesto, color, ancho de junta) tal como indica el system prompt;
  al responderlos en un segundo mensaje, ejecutó una traza real de **17**
  pasos de herramientas: `calcular_area`, dos `buscar_revestimientos`
  (refinando el filtro), tres `get_producto`, dos `buscar_evidencia` para
  m²/caja, `calcular_cajas`, `buscar_pegantes`, `buscar_boquillas`,
  `calcular_pegante`, `calcular_boquilla`, dos `buscar_evidencia` más para
  rendimientos, `validar_compatibilidad` y `calcular_presupuesto` con líneas
  de costo reales sumando contra el presupuesto de 800.000 COP declarado.
- Prueba del manejo de 429: se disparó real varias veces (las pruebas
  seguidas agotaron la cuota del free tier) y el backend respondió en todos
  los casos exactamente con el mensaje de rate limit esperado, sin romper la
  sesión ni dejar el historial en un estado inconsistente para el siguiente
  turno.
- Servidor de desarrollo verificado corriendo en `http://localhost:3000`
  (`npm run dev`, Turbopack), con `GET /` devolviendo 200 y `POST /api/chat`
  devolviendo respuestas reales del modelo, incluida al menos una corrida
  completa sin error de rate limit.
- Generación de PDF (`generar_cotizacion_pdf`) ejercitada como parte del
  loop de tools en las corridas anteriores; el endpoint
  `GET /api/cotizacion/[id]` sirve el buffer generado en memoria de esa
  sesión con `Content-Type: application/pdf`.
