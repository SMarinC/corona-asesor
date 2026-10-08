"use client";

import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { formatDuration } from "@/lib/ui/format";
import { buildTrace, type Timings, turnDuration } from "@/lib/ui/trace";
import { cn } from "@/lib/utils";

const PHASE_DOT = { running: "bg-primary", done: "bg-ok", review: "bg-review", error: "bg-bad" } as const;

/** The agent's last turn as steps with their wall time: the engineering, one click away. */
export function TraceTimeline({ messages, timings }: { messages: CoronaUIMessage[]; timings: Timings }) {
  const last = messages.findLast((m) => m.role === "assistant");
  if (!last) return null;
  const steps = buildTrace(last, timings[last.id]);
  if (steps.length === 0) return null;
  const total = turnDuration(timings[last.id]);
  const tools = steps.reduce((n, s) => n + s.tools.length, 0);

  return (
    <Collapsible className="rounded-xl border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm">
        <span>
          <span className="font-medium">Traza del agente</span>
          <span className="text-muted-foreground tabular">
            {" "}
            {steps.length} {steps.length === 1 ? "paso" : "pasos"}, {tools} {tools === 1 ? "herramienta" : "herramientas"}
            {total !== null && `, ${formatDuration(total)}`}
          </span>
        </span>
        <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="space-y-2 border-t px-4 py-3 text-sm">
          {steps.map((step) => (
            <li key={step.index} className="grid grid-cols-[3.5rem_1fr_auto] gap-2">
              <span className="text-muted-foreground tabular">Paso {step.index + 1}</span>
              <span className="space-y-1">
                {step.tools.map((tool) => (
                  <span key={tool.toolCallId} className="flex items-center gap-2" data-phase={tool.phase}>
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PHASE_DOT[tool.phase])} />
                    <code className="text-xs">{tool.name}</code>
                    {/* The dot is color only; the label says how the call ended, exactly as its card does. */}
                    <span className="sr-only">{tool.label}</span>
                  </span>
                ))}
                {step.wroteText && <span className="block text-muted-foreground">Escribió la respuesta</span>}
              </span>
              <span className="text-right text-muted-foreground tabular">{step.durationMs === null ? "…" : formatDuration(step.durationMs)}</span>
            </li>
          ))}
        </ol>
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Tiempo medido en tu navegador desde que enviaste el mensaje. Cada paso es una llamada al modelo; las herramientas corren en el servidor en milisegundos.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
