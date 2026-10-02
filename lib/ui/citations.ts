export const CITATION_ID = /^c\d{4}$/;
const CITATION_KEYS = new Set(["citationId", "compatibilityCitationId", "jointCitationId", "citationIds"]);

/** Every citation id a tool output carries, in first-seen order, without duplicates. */
export function citationIdsIn(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, key: string | null) => {
    // Ids the model supplied and computeMaterials rejected: never tool-returned, so never verified.
    if (key === "rejectedOverrides") return;
    if (typeof node === "string") {
      if (key !== null && CITATION_KEYS.has(key) && CITATION_ID.test(node)) found.add(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key === "citationIds" ? key : null);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) visit(v, k);
    }
  };
  visit(value, null);
  return [...found];
}

/** Turns "[c0084]" in the model's text into a markdown link that the renderer shows as a citation chip. */
export function linkCitations(text: string): string {
  return text.replace(/\[(c\d{4})\](?!\()/g, "[$1](#cita-$1)");
}

/** The citation id behind a link made by linkCitations, or null for any other link. */
export function citationIdFromHref(href: string | undefined): string | null {
  const match = href?.match(/^#cita-(c\d{4})$/);
  return match ? match[1] : null;
}
