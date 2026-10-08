# ADR-002: Stateless serverless on Vercel

**Status:** Accepted, 2026-10-01

## Context
A public portfolio demo with no accounts and no persisted conversations, running on a free tier.

## Decision
- **One Next.js app.** It has two routes: `POST /api/chat` (Node runtime, `maxDuration` 60 s) and `GET /api/citations/[id]`.
- **Static citations.** The citations route is prerendered as 912 static files, so a lookup never invokes a function.
- **Stateless server.** The client (`useChat`) holds the conversation and sends a trimmed history: 20 messages and 64 KB, using the server's own functions.
- **Stage from the history.** Each request derives the purchase stage from the history it receives (`stageFromHistory`), so the stage gate needs no session either ([ADR-003](003-tools-and-citation-verification.md)).
- **Panel and PDF from tool outputs.** They are a pure function of the tool outputs in that history (`deriveProject`), rendered in the browser.
- **Per-turn logging.** Each turn writes one structured `chat_turn` log line: steps, tools, latencies, tokens and outcome.

## Consequences
- **Scaling.** Nothing to migrate, back up or scale beyond the functions.
- **Forgeable history.** The history is client-supplied. A visitor can forge it, but can only mislead their own session ([ADR-006](006-abuse-protection-and-quota.md)).
- **Trimmed history.** If trimming drops the turn that proposed the tiles, the stage falls back to the first step. That costs a new search, never a wrong quote.
- **Explicit turn budget.** A turn has a 50 s budget below the platform limit, so a hung model stream still logs a turn.
