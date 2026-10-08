# ADR-005: Keep the Corona identity, with a strong disclaimer

**Status:** Accepted, 2026-10-01

## Context
The prototype was built for the AgentSprint by ReshapeX competition around Corona's real catalog. Removing the brand would hide the problem being solved. Keeping it creates a risk of looking official.

## Decision
- **Brand use.** Keep the Corona logo and name, its blue (`#005EB8`, actions only) and the product names and images.
- **Disclaimer wording.** The disclaimer covers five points:
  - this is an academic exercise for AgentSprint by ReshapeX;
  - it was built only from public information, with nothing privileged;
  - it is an improvement proposal;
  - it is not affiliated with or endorsed by Organización Corona;
  - the brand, catalog, technical sheets and images belong to Organización Corona.
- **Where it appears.** In the header dialog ("Demo académica"), under the chat input, in the PDF footer, in both READMEs and in the LICENSE exclusions.
- **Takedown.** Both READMEs say that any content Organización Corona wants removed will be removed right away, and link to the repository's issues for contact.

## Consequences
- The MIT license covers only the code. Corona's marks and data are excluded.
- Any request from Organización Corona to remove content or take the demo down is honored immediately.
