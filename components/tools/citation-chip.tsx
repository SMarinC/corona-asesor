"use client";

import { FileText, TriangleAlert } from "lucide-react";
import { Suspense, use, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CitationFragment } from "@/lib/ui/citation-fragment";
import { cn } from "@/lib/utils";

type FragmentState =
  | { status: "ok"; fragment: CitationFragment }
  /** The server answered but has no fragment: `notFound` for a 404, otherwise a transient or malformed answer. */
  | { status: "unavailable"; notFound: boolean }
  /** The request itself failed (network). */
  | { status: "failed" };

const fragments = new Map<string, Promise<FragmentState>>();
const failed = new Set<string>();

/**
 * One request per citation id per page load. The route is prerendered, so an unknown id answers with Next's static
 * 404 HTML, not JSON: only a 2xx response is parsed, and every other status is "unavailable".
 * A failed request stays cached while its popover is open (so React's retry render reuses it); it is forgotten
 * when the popover closes or the user presses "Reintentar".
 */
export function loadFragment(id: string): Promise<FragmentState> {
  let pending = fragments.get(id);
  if (!pending) {
    pending = fetch(`/api/citations/${id}`)
      .then(async (res): Promise<FragmentState> => {
        if (!res.ok) return { status: "unavailable", notFound: res.status === 404 };
        try {
          return { status: "ok", fragment: (await res.json()) as CitationFragment };
        } catch {
          return { status: "unavailable", notFound: false };
        }
      })
      .catch((): FragmentState => ({ status: "failed" }));
    fragments.set(id, pending);
    void pending.then((state) => {
      if (state.status === "failed") failed.add(id);
    });
  }
  return pending;
}

/** Forget a cached failure so the next load asks the server again. */
function forgetFailure(id: string) {
  if (failed.delete(id)) fragments.delete(id);
}

/** Test hook: forget every loaded fragment. */
export function resetFragmentCache() {
  fragments.clear();
  failed.clear();
}

function skuLine(fragment: CitationFragment): string {
  if (fragment.skus.length === 0) return "";
  const more = fragment.skusTruncated ? ` y ${fragment.skuCount - fragment.skus.length} más` : "";
  return `, SKU ${fragment.skus.join(", ")}${more}`;
}

function Fragment({ id, onRetry }: { id: string; onRetry: () => void }) {
  const state = use(loadFragment(id));
  if (state.status === "unavailable") {
    return (
      <p className="text-sm text-muted-foreground">
        {state.notFound ? `Fragmento no disponible. La cita ${id} no está en las fichas técnicas.` : "Fragmento no disponible por ahora."}
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>No se pudo cargar el fragmento {id}. Revisa tu conexión e inténtalo de nuevo.</p>
        <button type="button" onClick={onRetry} className="font-medium text-primary hover:underline">
          Reintentar
        </button>
      </div>
    );
  }
  const { fragment } = state;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Ficha técnica, sección {fragment.section.toLowerCase()}
        {skuLine(fragment)}
      </p>
      <blockquote
        tabIndex={0}
        className="max-h-60 overflow-y-auto border-l-2 border-grout pl-3 text-sm leading-relaxed whitespace-pre-line focus-visible:outline-2 focus-visible:outline-ring"
      >
        {fragment.text}
      </blockquote>
    </div>
  );
}

/**
 * A citation the agent made. `verified` means a tool returned this id in the conversation; an id the model
 * wrote on its own is shown in amber so an invented citation is visible, not hidden.
 */
export function CitationChip({ id, verified }: { id: string; verified: boolean }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  function onOpenChange(next: boolean) {
    if (!next) forgetFailure(id);
    setOpen(next);
  }

  function retry() {
    forgetFailure(id);
    setAttempt((n) => n + 1);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(
          "mx-0.5 inline-flex h-5 translate-y-[-1px] items-center gap-1 rounded-md border px-1.5 align-middle text-[0.72rem] font-medium tabular transition-colors",
          verified
            ? "border-primary/25 bg-accent text-accent-foreground hover:border-primary/50"
            : "border-review/40 bg-review-surface text-review hover:border-review",
        )}
        aria-label={verified ? `Ver la cita ${id} de la ficha técnica` : `Cita ${id} no verificada: ninguna herramienta la devolvió`}
      >
        {verified ? <FileText aria-hidden className="size-3" /> : <TriangleAlert aria-hidden className="size-3" />}
        {id}
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,calc(100vw-2rem))]" align="start" aria-label={`Cita ${id}`}>
        {!verified && (
          <p className="mb-3 rounded-md bg-review-surface px-2.5 py-2 text-xs text-review">
            Ninguna herramienta devolvió esta cita en la conversación. Tómala como no verificada.
          </p>
        )}
        {open && (
          <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando el fragmento…</p>}>
            <Fragment key={attempt} id={id} onRetry={retry} />
          </Suspense>
        )}
      </PopoverContent>
    </Popover>
  );
}
