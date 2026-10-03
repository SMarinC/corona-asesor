"use client";

import { createContext, type ReactNode, use, useMemo } from "react";
import { CitationChip } from "@/components/tools/citation-chip";

const CitationsContext = createContext<ReadonlySet<string>>(new Set());

/** The citation ids tools returned in this conversation; chips outside this set are flagged as unverified. */
export function CitationsProvider({ ids, children }: { ids: readonly string[]; children: ReactNode }) {
  const verified = useMemo(() => new Set(ids), [ids]);
  return <CitationsContext value={verified}>{children}</CitationsContext>;
}

/** A chip for an id that came from a tool output (cards) or from the model's text (answer). */
export function Citation({ id }: { id: string }) {
  const verified = use(CitationsContext).has(id);
  return <CitationChip id={id} verified={verified} />;
}
