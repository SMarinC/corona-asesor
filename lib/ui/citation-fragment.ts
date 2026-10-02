import type { SheetChunk } from "@/lib/domain/types";

/** What the citation popover shows: the fragment the agent cited, as stored in the technical-sheet snapshot. */
export interface CitationFragment {
  citationId: string;
  section: string;
  docType: string;
  skus: string[];
  text: string;
  truncated: boolean;
}

export const MAX_FRAGMENT_CHARS = 1_200;
const MAX_FRAGMENT_SKUS = 10;

export function toCitationFragment(chunk: SheetChunk): CitationFragment {
  const truncated = chunk.text.length > MAX_FRAGMENT_CHARS;
  return {
    citationId: chunk.citationId,
    section: chunk.section,
    docType: chunk.docType,
    skus: chunk.skus.slice(0, MAX_FRAGMENT_SKUS),
    text: truncated ? `${chunk.text.slice(0, MAX_FRAGMENT_CHARS)}…` : chunk.text,
    truncated,
  };
}
