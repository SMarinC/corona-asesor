import { SUGGESTIONS } from "@/lib/ui/suggestions";

/** First visit: what the asesor does and three complete projects to start from. */
export function EmptyState({ onPick, disabled }: { onPick: (prompt: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col justify-center gap-6 py-10">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-balance">¿Qué vas a enchapar?</h2>
        <p className="text-muted-foreground text-pretty">
          Te ayudo a elegir revestimiento, pegante y boquilla, a calcular cuánto comprar y a cotizarlo con los precios del catálogo de
          Corona. Cada número sale de una herramienta, no de una suposición.
        </p>
      </div>
      <ul className="grid gap-2">
        {SUGGESTIONS.map((s) => (
          <li key={s.title}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.prompt)}
              className="w-full rounded-xl border bg-card px-4 py-3 text-left transition-colors duration-150 hover:border-primary/50 hover:bg-accent/40 disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{s.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
