# ADR-001: A static, preprocessed data snapshot

**Status:** Accepted, 2026-10-01

## Context
The competition prototype read a 58 MB DuckDB file and a Chroma store built from a scrape of Corona's public catalog. A serverless demo needs small, fast, read-only data. This project exists to show **agent behavior**, not ingestion.

## Decision
Curate the scrape once, offline (`npm run data:build`, `npm run data:embed`), into versioned artifacts:
- `data/catalog.json`: 341 purchasable SKUs (298 tiles, 12 adhesives, 31 grouts).
- `data/sheets.json`: 912 deduplicated technical-sheet fragments, each with a `citationId` and its SKUs.
- `data/sheets.index.bin`: `gemini-embedding-2`, 768 dimensions, int8-quantized, about 0.7 MB.
- `data/manifest.json`: counts, model and the sha256 of `sheets.json`, checked at load.

The pipeline also fills a value the catalog page lacks when the product's **own** technical sheet states it: two tiles get their m² per box this way. Nothing is filled at runtime, and nothing comes from the model.

In total the artifacts take about 3.1 MB. The build fails if the catalog and the sheets together pass 2.8 MB. Search is in-memory, and a failed query embedding falls back to keyword search.

## Consequences
- **Snapshot prices.** Prices and stock are those of the snapshot, and the quote says so (`priceNote`).
- **No refresh.** A refresh pipeline that tracks new products is feasible, but out of scope.
- **Nothing to provision.** There is no database; cold starts read local files once per instance.
- **Incomplete products stay incomplete.** Five products still lack a value needed to size a quantity. The agent does not offer them ([ADR-003](003-tools-and-citation-verification.md)).
