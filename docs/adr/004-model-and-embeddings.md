# ADR-004: gemini-3.5-flash-lite and gemini-embedding-2 on the free tier

**Status:** Accepted, 2026-10-01

## Context
The demo must cost nothing to run. Google AI Studio's free tier gives `gemini-3.5-flash-lite` 15 requests per minute, 250K tokens per minute and 500 requests per day, and `gemini-embedding-2` 100 RPM and 1K RPD.

## Decision
- **Chat model:** `gemini-3.5-flash-lite` through the AI SDK Google provider. A turn has at most 10 steps, and the last step has tools disabled so it always answers. `maxOutputTokens` is 2,048, with 1 retry.
- **Embeddings:** query embeddings use `taskType: RETRIEVAL_QUERY` and 768 dimensions, against an index built with `RETRIEVAL_DOCUMENT`. They use no retries and a 4 s timeout, and fall back to keyword search on any failure.
- **Global caps** sit below the free tier: 12 model calls per minute and 200 per day.

## Consequences
- **Busy moments.** A full quote takes about 10 model calls over four turns, so the per-minute cap serves about one full quote per minute and the daily cap about 20. Busy moments show a countdown, not an error.
- **Few embeddings.** The staged flow seldom needs the technical sheets: the latest eval run embedded no queries.
- **Data use.** The free tier may use prompts to improve Google's products, and the disclaimer dialog says so.
- **Upgrade path.** A paid key or another provider would need only the provider line in `lib/agent/agent.ts` and new caps.
