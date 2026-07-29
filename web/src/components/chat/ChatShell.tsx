"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizonal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { CandidatesPanel } from "./CandidatesPanel";
import type { ChatApiResponse, ChatMessage, Producto, TraceStep } from "@/lib/types/chat";
import { toast } from "sonner";

const SUGERENCIAS = [
  "Quiero cotizar un baño de 3x2 m, interior, zona húmeda, diseño marmolizado",
  "¿Qué pegante uso para porcelanato en exterior?",
  "¿Tienen financiación para remodelar?",
];

function extraerCandidatos(trace: TraceStep[]): Producto[] {
  const vistos = new Map<string, Producto>();
  for (const paso of trace) {
    if (paso.tool !== "buscar_revestimientos") continue;
    const resultados = (paso.output?.resultados ?? []) as Producto[];
    for (const p of resultados) {
      if (p?.sku && !vistos.has(p.sku)) vistos.set(p.sku, p);
    }
  }
  return Array.from(vistos.values());
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const candidatos = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.trace && m.trace.length > 0) {
        const c = extraerCandidatos(m.trace);
        if (c.length > 0) return c;
      }
    }
    return [];
  })();

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", contenido: trimmed };
    const pendingId = uid();
    setMessages((prev) => [...prev, userMsg, { id: pendingId, role: "assistant", contenido: "", pending: true }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data: ChatApiResponse = await res.json();

      if (!res.ok) {
        throw new Error(data?.texto || "Error de red.");
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, contenido: data.texto, trace: data.trace, error: data.error, pending: false }
            : m
        )
      );
      if (data.error) {
        toast.error("El agente tuvo un problema", { description: data.texto });
      }
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? {
                ...m,
                contenido: "Tuve un problema hablando con el modelo. Intenta de nuevo en un momento.",
                pending: false,
                error: e instanceof Error ? e.message : String(e),
              }
            : m
        )
      );
      toast.error("No se pudo contactar al agente");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  async function handleReset() {
    setMessages([]);
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
    } catch {
      /* no crítico */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-6">
      {/* Columna de chat */}
      <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Conversación</p>
            <h2 className="font-heading text-lg font-semibold -mt-0.5">Corona Asesor</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 text-muted-foreground min-h-11 sm:min-h-9"
            aria-label="Reiniciar conversación"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Reiniciar</span>
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0" viewportRef={scrollRef}>
          <div className="px-4 sm:px-5 py-4 space-y-5">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <span className="text-xs font-bold">CA</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed">
                    Cuéntame cómo puedo ayudarte hoy: puedo cotizar pisos y revestimientos con pegante y
                    boquilla, o resolver dudas generales de Corona.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-11">
                  {SUGERENCIAS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border bg-secondary/60 px-3 py-2 text-xs text-secondary-foreground hover:border-primary/50 hover:bg-secondary transition-colors cursor-pointer min-h-11 sm:min-h-0 sm:py-1.5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-3 sm:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring transition-shadow">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe tu proyecto o pregunta lo que quieras de Corona…"
              rows={1}
              className="min-h-11 max-h-40 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              aria-label="Enviar mensaje"
              className="size-11 shrink-0 rounded-xl"
            >
              <SendHorizonal className="size-4.5" />
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            Enter para enviar · Shift+Enter para salto de línea
          </p>
        </div>
      </div>

      {/* Panel lateral de candidatos */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
          <CandidatesPanel productos={candidatos} />
        </div>
      </aside>

      {/* Versión mobile del panel de candidatos, debajo del chat */}
      {candidatos.length > 0 && (
        <div className="lg:hidden rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
          <CandidatesPanel productos={candidatos} />
        </div>
      )}
    </div>
  );
}
