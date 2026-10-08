# ADR-003: Tools, grounding and the stage gate

**Status:** Accepted, 2026-10-01. Revised 2026-10-07: staged flow, stage gate, company-owned data.

## Context
The claim is that the agent never invents a product, price or quantity. Language models are bad at arithmetic, catalog lookup and rule application, and good at choosing what to do next.

Earlier versions had two problems:
- **The model could supply data.** When the catalog lacked a value (m² per box, adhesive coverage, bag size), the model could pass one to `computeMaterials` together with a technical-sheet citation. That made the model a data source, and checking its citations needed a growing set of rules.
- **The order was only a request.** With the whole flow in one prompt, a customer who gave every detail at once often got a quote in the first turn. The model skipped the tile choice or picked the supplies itself (eval run 3), even though every number was grounded.

## Decision

### One tool per job the model must not do
- **Eight tools:** `searchTiles`, `searchSupplies`, `getProduct`, `searchTechnicalSheets`, `computeMaterials`, `checkCompatibility`, `buildQuote` and `getCompanyInfo`.
- **No thrown errors.** Every tool returns `ok | needs_review | error` and never throws into the agent loop.

### The data belongs to the company, not the model
- **The model supplies no data values.** It passes what the customer said (room size, conditions, joint width, budget) and SKUs. Every product value comes from the catalog. The model-supplied, cited overrides were removed.
- **Incomplete products are not offered.** A product that lacks a value needed to size a quantity is excluded: 2 tiles, 1 adhesive and 2 grouts, so 336 of the 341 products are offered. Asked by SKU, the tools say which value is missing.
- **Gaps are filled offline.** Where a tile's own technical sheet states its m² per box, the data pipeline fills it (2 tiles, [ADR-001](001-static-data-snapshot.md)).
- **Prices.** `buildQuote` accepts only `{ sku, quantity }` and prices every line from the catalog.
- **Quantities.** They come from `computeMaterials`. `buildQuote` flags, as `needs_review`, any line that no calculation in the conversation produced. It uses the same rule as the UI panel (`lib/domain/quantity-check.ts`).
- **Unknown data.** Unknown data is "Requiere revisión", never "Incompatible".
- **Display names from the catalog.** Adhesive names show the bag size ("PEGACOR® Interiores Gris · 10 kg"), derived from catalog data (`lib/domain/display-name.ts`), so two bag sizes never read as one product.

### Citations come from tool outputs
- **Chips, not prose.** The compatibility checks and the sheet fragments carry citation ids, and the UI shows them as chips that open the cited fragment.
- **Only returned ids are verified.** An id the model writes in its text is shown as verified only when a tool returned it in the conversation; otherwise it reads "no verificada".
- **No citation rules for the model.** The prompt never asks it to write citations.

### A staged flow, enforced by a stage gate
- **The flow.** Space, then the tile (the customer chooses), then the joint width (confirmed), then the adhesive and grout, then the quote, "¿Confirmas…?" and the close.
- **The stage comes from the history.** `stageFromHistory` (`lib/agent/stage.ts`) derives it from what earlier turns proposed: `explore`, `supplies`, `quote` or `quoted`.
- **Only that stage's tools are active.** The agent's `prepareStep` sets `activeTools` for each step. Each stage keeps the earlier stages' tools, so the customer can go back and change a decision.
- **The prompt follows the stage.** `buildSystemPrompt(stage)` is a short honesty core plus a "Paso actual" section that names only that step and its tools.
- **Out-of-step calls never run.** A call outside the stage is rejected before it runs (`tool_unavailable`). It is hidden in the UI, left out of the model's history and counted on its own by the evals ("herramientas fuera de paso").

**Why a gate, not more prompt rules.** The model kept the honesty rules but not the order. Enforcing the order in code makes skipping a step impossible, whatever the customer writes. The per-step prompt then only has to describe one step, and the model rarely reaches for a tool that is not there: the gate rejected 7 calls in eval run 4 and none in run 5.

### Simple, deterministic evals
- **The scenarios.** Eight staged, multi-turn scenarios run against the real model, through the real route handler and tools.
- **The checks.** They are structural, over the tool parts and the panel's own ledger: completed, steps, tool inputs, quantities computed, catalog prices, money from tools, asks, review, link and staged.
- **The text they read.** Only the peso amounts and quantities in an answer, the "Requiere revisión" wording and the out-of-catalog link. There is no model-as-judge.

**Why.** An earlier scorer grew regex heuristics over the answer text. They rejected correct wording, and every fix cost a paid rerun. Structural checks test the guarantees themselves, give the same verdict every time, and run without quota through the scripted model (`npm run evals -- --scripted`).

## Consequences
- **Short turns, more of them.** A full quote takes four turns with a median of 2 steps each, about 10 model calls in all. The prototype needed 10–17 steps in one turn.
- **Visible gaps.** Some answers say "Requiere revisión", and five products are not offered, instead of guessing. That is the intended trade-off.
- **Known gap.** The stage counts the tiles proposed, not the tile chosen. Prompt `2026-10-07.3` asks for the choice in the supplies step, but it has not yet been run against the real model.
