# Corona Asesor — Portfolio Rewrite Design

**Date:** 2026-10-01 · **Status:** Approved, pending implementation plan

## 1. Goal

Rebuild the AgentSprint (ReshapeX) prototype into a portfolio-grade, publicly
deployed agent that proves one claim with evidence: **the agent never invents a
product, price or quantity — every number comes from a tool that read real data
or computed it deterministically.**

### Success criteria

1. Live on Vercel; a full quote flow (bathroom 3×2 m, wet area, budget) streams
   visibly from first tool call to downloadable PDF.
2. Grounding evals: ≥ 11/12 scenarios pass; 0 ungrounded numbers in final answers.
3. CI green on every push (typecheck, lint, unit tests, build).
4. A typical quote completes in ≤ 7 agent steps (prototype: 10–17).
5. Repository history contains no Claude co-author trailers and no committed
   binary databases.

### Non-goals

- A live catalog refresh/scraping pipeline (data is a frozen snapshot; see §4).
- User accounts, persisted conversations, payments, multi-language UI.
- Supporting product categories beyond tiles, adhesives and grout.

## 2. Decisions summary

| Area | Decision |
|---|---|
| Repo | New repo under the author's account; history rewritten with `git filter-repo`. The team repo is not touched. |
| Stack | Single Next.js (App Router) app at repo root, TypeScript only, deployed on Vercel. Python and Streamlit removed from `main` (kept in history). |
| LLM | `gemini-3.5-flash-lite` via the AI SDK Google provider (free-tier key). |
| Embeddings | `gemini-embedding-2`, 768 dimensions, int8-quantized, static artifact. |
| State | Stateless server; conversation history lives in the client (`useChat`). |
| Abuse protection | Vercel BotID + Upstash rate limiting (per IP + global daily cap) + input/step caps. |
| UI | Chat with inline generative tool cards + live "Tu proyecto" panel + collapsible trace timeline. |
| Brand | Corona identity kept, with a non-affiliation disclaimer in header modal, footer, PDF and README. |
| Language | Code, comments, README (EN) + `README.es.md`; UI and agent remain in Spanish. |
| Quality | Vitest unit and harness tests + grounding evals against the real model. |

## 3. Architecture

```
corona-agent/
├── app/
│   ├── page.tsx                 # Chat + project panel
│   └── api/chat/route.ts        # Single endpoint: guard → streamText → UI stream
├── lib/
│   ├── agent/
│   │   ├── agent.ts             # Model, system prompt, tools, stop conditions
│   │   ├── prompt.ts            # Versioned system prompt (Spanish)
│   │   └── tools/               # One file per tool: zod schema + execute + output type
│   ├── domain/                  # Pure functions: calculations, rules, citations, quote
│   ├── data/                    # Read-only loaders for static artifacts + vector search
│   └── guard/                   # BotID, rate limit, input validation, error mapping
├── components/                  # Chat, tool cards, project panel, trace timeline, PDF
├── data/                        # Generated, versioned artifacts (catalog + index)
├── scripts/                     # Offline pipeline: source DBs → artifacts
├── evals/                       # Grounding scenarios + runner + latest report
├── tests/                       # Vitest
└── docs/adr/                    # Architecture decision records
```

### Request flow

1. Client (`useChat`) POSTs the trimmed message history to `/api/chat`.
2. `lib/guard` runs in order: BotID check → rate limit (per IP, then global) →
   zod validation (message ≤ 1,000 chars; history truncated to the last 20
   messages). Any failure returns a typed error code, never a stack trace.
3. `streamText` runs the agent with `stopWhen: stepCountIs(10)`, a bounded
   `maxOutputTokens`, and the 8 tools. The route sets `maxDuration`.
4. The UI message stream delivers text deltas, tool-call inputs and tool
   outputs as they happen.
5. The client derives the project panel from tool outputs with a pure reducer
   (`deriveProject(messages)`), so the panel always shows exactly what tools
   computed.
6. The PDF is rendered in the browser from the `buildQuote` output.

Server-side, each turn emits one structured log line: steps, tool names,
per-step latency, token usage, outcome.

## 4. Data

### Source and rationale (to be stated in ADR-001 and the README)

The catalog (505 products) and technical-sheet fragments (3,754) are a
**preprocessed snapshot of a scrape of Corona's public catalog**, produced for
the competition. They are frozen on purpose: a pipeline that tracks new products
is feasible but out of scope, because this project exists to demonstrate
**agent behavior**, not ingestion.

### Pipeline (`scripts/`, run once, offline)

1. Read `products` from the source DuckDB and fragments from the source Chroma
   SQLite (both kept locally in a git-ignored `data/source/`).
2. **Curate:**
   - Keep only purchasable products (`is_variant = true`): 341 SKUs (298 tiles,
     12 adhesives, 31 grouts). Rows with `is_variant = false` are product-family
     marketing pages with no price or stock.
   - Drop safety data sheets (templates `hoja_seguridad_*`, 1,654 fragments):
     toxicology/first-aid content is irrelevant to quoting.
   - Deduplicate fragments by text: every variant carried its own copy of the
     family sheet. 2,100 → ~1,075 unique chunks, each listing the SKUs it
     belongs to. Drop chunks not linked to any catalog SKU.
3. Normalize each product into a typed `Product` (§4.1).
4. Embed chunks with `gemini-embedding-2` (768-d) in batches with retry,
   backoff and a resumable checkpoint (free-tier safe); L2-normalize; quantize
   to int8.
5. Write `data/catalog.json`, `data/sheets.json` (text + metadata +
   `citationId` + `skus`) and `data/sheets.index.bin` (~0.8 MB). Target total
   ≤ 3 MB (prototype: 58 MB).
6. Write `data/manifest.json` (counts, model ID, dimensions, build date).

### 4.1 Normalization rules

The prototype ignored the `specs_pdf` column, which already holds values
extracted from the technical sheets. It is now the primary source.

- **Box coverage:** `m2PerBox` and `piecesPerBox` from `specs_pdf`
  (294/298 tiles). The remaining 4 resolve via cited values or `needs_review`.
- **Traffic:** from the sheet's `trafico` label: "Comercial …" → `high`,
  "Residencial General" → `medium`, "… Moderado" → `low`; anything else
  (e.g. "Paredes") → `null`.
- **Thickness:** max of the `espesor_nominal` range (e.g. "7,90 a 8,50 mm" → 8.5).
- **Format:** `specs_pdf.formato`, else the product name (cm → mm).
- **Tri-state attributes** `indoor`, `outdoor`, `wetArea` (`true | false |
  null`) derived from "Áreas de uso". **No usage areas → `null` (unknown),
  never `false`.**
- **Materials** normalized to `ceramic | porcelain | porcelatech | stoneware`
  (PorcelaTech is kept separate: some adhesives accept it while explicitly
  excluding gres porcelánico).
- **Prices** are per box for tiles (verified on corona.co: "Precio por Caja"),
  per bag/unit for adhesives and grouts.
- **Adhesives:** coverage range (kg/m²) parsed from the sheet text (e.g.
  "5.0-6.0 kg/m2 según formato" → {5, 6}); bag size from `presentacion_kg`.
  Compatible materials, explicitly excluded materials and outdoor suitability
  come from a curated product-line table where **every entry carries a verbatim
  quote from that product's "Usos" section; the pipeline fails if the quote is
  not found** and stores its `citationId`. Unknown lines → `null`. (The
  prototype's name-based guesses were wrong for 3 of 7 lines, e.g. Ultra Gel
  explicitly excludes gres porcelánico.)
- **Grouts:** joint range **extracted from the grout's own sheet** ("juntas de
  1 a 5 mm") and stored with its `citationId`; not found → `null`. Type:
  cementitious / epoxy / repair (repair products are never offered for grouting).
- Images and product URL preserved.

### Runtime search

- Catalog: in-memory filters over `catalog.json`; results ranked by number of
  matched filters (ties broken by availability, then price), **not** price-first.
- Sheets: query embedded with `gemini-embedding-2` (same dimensions),
  brute-force cosine over the int8 index, optional `sku` filter; top-k with
  scores. If embedding the query fails, fall back to a keyword search over
  fragment text (mode reported in the output).

## 5. Agent tools

Principle: a tool exists only for work the LLM **must not** do itself — reading
real data, computing, or applying rules. Every tool returns a discriminated
union:

```ts
type ToolResult<T> =
  | { status: "ok"; data: T }
  | { status: "needs_review"; data: Partial<T>; missing: MissingField[] }
  | { status: "error"; code: string; message: string };
```

Tools never throw into the loop; errors are data the model can react to.

| Tool | Input (summary) | Behavior |
|---|---|---|
| `searchTiles` | surface (floor/wall), indoor/outdoor, wetArea, finish, design, color, maxPrice, limit | Filters catalog; unknown attributes do not exclude a product but are flagged. Ranked by filter fit. |
| `searchSupplies` | kind (`adhesive`/`grout`), tileMaterial, outdoor, jointWidthMm, color, limit | Adhesives filtered by compatible/excluded material and outdoor suitability; grouts by joint range and color (repair products excluded). |
| `getProduct` | sku | Full normalized product. |
| `searchTechnicalSheets` | query, sku?, k? | Returns fragments with `citationId`, sku, section, source sheet, score, search mode. |
| `computeMaterials` | lengthM, widthM, wastePct?, tileSku, adhesiveSku?, groutSku?, jointWidthMm?, overrides? | Computes area + waste, boxes, adhesive kg/bags, grout kg/units. Adhesive uses the **upper bound** of the coverage range (conservative; stated in the output). Grout uses the standard joint-volume formula (labeled as an estimate). Values missing from the catalog (`m2PerBox`, `adhesiveCoverageKgM2`, `bagKg`) may be supplied as `{ value, citationId }`; the tool **verifies the cited chunk belongs to that SKU and the number appears in its text** (locale-aware: `1,44` ≡ `1.44`), rejecting it otherwise. Still-missing values → `needs_review` listing them. |
| `checkCompatibility` | tileSku, environment, wetArea, traffic, jointWidthMm?, adhesiveSku?, groutSku? | Rules engine. Project conditions are **required** (no hidden defaults). Verdict = worst of: environment, humidity, traffic (skipped for walls), adhesive↔material, grout↔joint, availability. Unknown data → "Requiere revisión", never "Incompatible". |
| `buildQuote` | lines: `{ sku, quantity }[]`, budget?, projectSummary?, includeLinks? | Looks up **all prices from the catalog** (never accepts prices from the model). Lines without a price → `needs_review`. `withinBudget` is `null` when no budget is given. Returns the structured quote used by the panel and the PDF. |
| `getCompanyInfo` | section? | Institutional data and links for out-of-catalog categories. |

The system prompt describes the workflow (gather missing project data → search
tiles → cite sheets for missing specs → search supplies → compute → check →
quote) and the honesty rules. The prompt is versioned and covered by evals.

## 6. UI

- **Desktop:** two columns — chat (left) and "Tu proyecto" panel (right) with
  five sections: Espacio → Revestimiento → Materiales → Compatibilidad →
  Total + PDF. Collapsible trace timeline at the bottom of the panel.
- **Mobile:** single column; the panel becomes a compact bottom bar
  (e.g. "Total $612.300 · 5 pasos ✓") that expands into a sheet.
- **Live steps:** each tool call appears in the chat as soon as it starts
  ("Buscando revestimientos…") and resolves to ✓ with latency.
- **Tool cards:** product (image, price, format), evidence (quoted fragment +
  source), compatibility (badge + expandable rules), needs-review (amber, lists
  what is missing).
- **Streaming text** for the final answer; **Stop** button while running.
- **States:** empty (greeting + 3 suggestions taken from eval scenarios), rate
  limited / quota exhausted (banner with retry time, input disabled), model
  error (retry button).
- **Brand:** Corona blue `#005EB8`, Inter, shadcn/ui on Tailwind v4,
  light/dark, `motion` animations honoring `prefers-reduced-motion`.
- **Disclaimer** (header chip "Demo académico" → modal; footer; PDF footer):
  academic exercise for the AgentSprint by ReshapeX competition; built only
  from publicly available information, no privileged data; an improvement
  proposal for a real problem; the Corona brand, logo, catalog, technical
  sheets and images belong to Organización Corona; not affiliated with or
  endorsed by Organización Corona.
- **PDF:** `@react-pdf/renderer`, client-side, from the `buildQuote` output:
  brand header, line table, total vs. budget, cited evidence, disclaimer.

## 7. Abuse protection and error handling

| Guard | Setting (initial, tunable via env) |
|---|---|
| BotID | Required on `/api/chat`; bots → 403 before any model call. |
| Per-IP limit | 15 requests / 10 min sliding window; 60 / day. |
| Global daily cap | `GLOBAL_DAILY_REQUEST_CAP` env var, set to ~80% of the key's requests-per-day limit shown in Google AI Studio (counted in model calls, not chat messages); exhausted → `quota_exhausted`. |
| Message size | ≤ 1,000 characters; history truncated to last 20 messages. |
| Agent steps | `stepCountIs(10)`. |

Client-facing error codes: `bot_detected`, `rate_limited` (with `retryAfter`),
`quota_exhausted`, `invalid_input`, `model_error`. Details are logged
server-side only. The free-tier data-usage note appears in the disclaimer modal.

## 8. Testing and evaluation

- **Unit (Vitest), `lib/domain`:** port the 15 existing pytest cases; add
  normalization (tri-state unknowns), citation verification (exact, locale
  variants, absent number), quote pricing (missing price, no budget).
- **Tools:** against a small fixture catalog and fixture fragments; no network.
- **Harness:** AI SDK `MockLanguageModel`: multi-step loop, tool error returned
  as data, step cap reached, guard rejections.
- **Evals (`npm run evals`):** 12 scenarios against the real model, e.g.:
  wet bathroom with budget; outdoor terrace; budget too low; missing
  dimensions (must ask); wall tiles (traffic rule skipped); product lacking
  m²/box (must cite or flag); out-of-catalog question (redirect with link);
  company question; joint width out of grout range; no budget given;
  user-supplied fake price (must not be used); adversarial "just estimate it".
  Checks: expected tools called; **every number in the final answer appears in
  some tool output or in the user's input**; needs-review cases flagged;
  step count. Output: `evals/report.md` (committed), summarized in the README.

## 9. CI and deployment

- **GitHub Actions:** on push/PR → install, typecheck, lint, Vitest, build.
  Evals via `workflow_dispatch` only, with the API key as a repository secret.
- **Vercel:** project linked to the new repo; previews per PR, production on
  `main`. Env: `GOOGLE_GENERATIVE_AI_API_KEY` (set by the owner, never
  committed), Upstash variables (provisioned via Marketplace), guard limits.
  Domain: `*.vercel.app`.

## 10. Repository migration (phase 0)

1. Fresh clone → `git filter-repo`:
   - strip `Co-Authored-By: Claude …` trailers from all commit messages;
   - remove `data/processed/` (58 MB of binaries) from all history.
2. Keep authorship of all human contributors intact.
3. Create the repo under the author's GitHub account (explicit confirmation
   right before creation) and push.
4. Source DBs move to git-ignored `data/source/` locally.

## 11. Documentation

- `README.md` (EN) and `README.es.md`: demo link + GIF, problem, architecture
  (Mermaid), tool design and grounding guarantees, eval results, local setup,
  credits, disclaimer.
- Credits: original prototype built by a team (Daniel Garzón, Juan Miranda,
  Santiago Marín) for AgentSprint by ReshapeX; this version (TypeScript
  architecture, agent harness, streaming UI, evals, deployment) is a rewrite by
  Santiago Marín.
- `docs/adr/`: 001 static data snapshot; 002 stateless serverless architecture;
  003 tool design and citation verification; 004 model and embedding choice;
  005 brand usage and disclaimer.
- `LICENSE`: MIT for source code, with an explicit exclusion: Corona trademarks,
  logos, catalog data, technical sheets and product images are property of
  Organización Corona and are not licensed.

## 12. Implementation order

0. Repository migration.
1. Data pipeline and artifacts.
2. Domain logic + unit tests.
3. Tools + harness + tests.
4. API route + guards.
5. UI.
6. Evals.
7. CI + Vercel deployment.
8. README, ADRs, GIF.

Each phase is validated before the next one starts.
