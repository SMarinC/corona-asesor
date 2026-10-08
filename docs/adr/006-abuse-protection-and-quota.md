# ADR-006: Abuse protection, quota and the client-held history

**Status:** Accepted, 2026-10-02

## Context
The demo is a public endpoint that spends a free-tier quota.

## Decision
The guard order is BotID, then the limits, then input validation.

- **BotID (Basic, free).** Requests without the browser challenge get `403 bot_detected` before any model call, so `curl` against `/api/chat` is rejected in production. Use the UI instead.
- **Upstash rate limits (Vercel Marketplace, Free plan):**
  - per hashed IP: 15 requests per 10 minutes and 60 per day;
  - global: 12 model calls per minute and 200 per day.

  Every model call is charged as it starts, including aborted turns. IPs are stored only as an HMAC with a secret salt.
- **Input caps:**
  - at most 1,000 characters of user text per message;
  - history trimmed to 20 messages and 64 KB;
  - body at most 512 KB.
- **Fail open, and log it.** If BotID or Upstash is unavailable, the turn proceeds and an error line is logged. Redis checks time out after 1 s, and the demo stays usable while the remaining guards hold.

## Consequences
- **Forged history.** It cannot change prices, which come from the catalog. It can only mislabel that visitor's own quote or move their own stage, so it is an accepted risk.
- **Token-weighted limiter not needed yet.** The call cap binds long before the 250K tokens-per-minute limit: the largest turn in the latest eval run used about 21K input tokens across all its calls. A token-weighted limiter was deferred. The eval report lists each turn's tokens.
