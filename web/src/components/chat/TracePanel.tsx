"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleAlert, CircleX, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { toolMeta } from "@/lib/toolMeta";
import type { TraceStep } from "@/lib/types/chat";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

function fmtCOP(v: unknown): string | null {
  if (typeof v !== "number") return null;
  return v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { icon: typeof CircleCheck; className: string }> = {
    Compatible: { icon: CircleCheck, className: "bg-success/15 text-success border-success/30" },
    Incompatible: { icon: CircleX, className: "bg-destructive/10 text-destructive border-destructive/30" },
    "Requiere revisión": { icon: CircleAlert, className: "bg-warning/20 text-warning-foreground border-warning/40" },
  };
  const m = map[estado] ?? { icon: CircleAlert, className: "bg-muted text-muted-foreground border-border" };
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", m.className)}>
      <Icon className="size-3.5" />
      {estado}
    </Badge>
  );
}

/** Resumen legible de una llamada a herramienta: evita el dump de JSON crudo. */
function StepSummary({ step }: { step: TraceStep }) {
  const { tool, input, output } = step;

  if (output?.error) {
    return <p className="text-sm text-destructive">{String(output.error)}</p>;
  }

  switch (tool) {
    case "calcular_area":
      return (
        <p className="text-sm text-muted-foreground">
          {input.largo_m} m × {input.ancho_m} m
          {output?.detalle ? <span className="block mt-0.5">{output.detalle}</span> : null}
        </p>
      );
    case "buscar_revestimientos":
    case "buscar_pegantes":
    case "buscar_boquillas": {
      const n = output?.n ?? output?.resultados?.length ?? 0;
      const filtros = Object.entries(input)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return (
        <p className="text-sm text-muted-foreground">
          {n} resultado{n === 1 ? "" : "s"}
          {filtros ? <span className="block mt-0.5 opacity-80">{filtros}</span> : null}
        </p>
      );
    }
    case "get_producto":
      return (
        <p className="text-sm text-muted-foreground">
          {output?.nombre ? (
            <>
              {output.nombre} <span className="opacity-70">({input.sku})</span>
            </>
          ) : (
            `SKU ${input.sku}`
          )}
        </p>
      );
    case "calcular_cajas":
      return (
        <p className="text-sm text-muted-foreground">
          {output?.requiere_revision ? (
            <span className="text-warning-foreground">Requiere revisión: falta m²/caja</span>
          ) : (
            <>
              {output?.cajas} cajas ({output?.m2_cubiertos} m² cubiertos)
              {fmtCOP(output?.costo_revestimiento) ? ` · ${fmtCOP(output?.costo_revestimiento)}` : ""}
            </>
          )}
        </p>
      );
    case "calcular_pegante":
      return (
        <p className="text-sm text-muted-foreground">
          {output?.requiere_revision ? (
            <span className="text-warning-foreground">Requiere revisión: falta rendimiento</span>
          ) : (
            <>
              {output?.bultos} bultos ({output?.kg_necesarios} kg)
              {fmtCOP(output?.costo_pegante) ? ` · ${fmtCOP(output?.costo_pegante)}` : ""}
            </>
          )}
        </p>
      );
    case "calcular_boquilla":
      return (
        <p className="text-sm text-muted-foreground">
          {output?.requiere_revision ? (
            <span className="text-warning-foreground">Requiere revisión: faltan medidas</span>
          ) : (
            <>
              {output?.unidades} unidades ({output?.kg_necesarios} kg)
              {fmtCOP(output?.costo_boquilla) ? ` · ${fmtCOP(output?.costo_boquilla)}` : ""}
            </>
          )}
        </p>
      );
    case "validar_compatibilidad":
      return (
        <div className="space-y-1.5">
          {output?.estado ? <EstadoBadge estado={output.estado} /> : null}
          <ul className="text-sm text-muted-foreground space-y-0.5 mt-1.5">
            {(output?.verificaciones ?? []).map((v: { regla: string; estado: string; mensaje: string }, idx: number) => (
              <li key={idx} className="flex items-baseline gap-1.5">
                <span className="opacity-60">{v.regla}:</span> {v.mensaje}
              </li>
            ))}
          </ul>
        </div>
      );
    case "calcular_presupuesto":
      return (
        <p className="text-sm text-muted-foreground">
          Total {fmtCOP(output?.costo_total)}:{" "}
          <span className={output?.dentro_presupuesto ? "text-success" : "text-destructive"}>
            {output?.dentro_presupuesto ? "dentro de presupuesto" : "excede presupuesto"}
          </span>
        </p>
      );
    case "generar_cotizacion_pdf":
      return <p className="text-sm text-muted-foreground">Cotización generada y lista para descargar.</p>;
    case "buscar_evidencia":
      return (
        <p className="text-sm text-muted-foreground">
          {output?.n ?? 0} fragmento{(output?.n ?? 0) === 1 ? "" : "s"} de ficha técnica
          {input.sku ? ` (SKU ${input.sku})` : ""}: &ldquo;{input.consulta}&rdquo;
        </p>
      );
    default:
      return <p className="text-sm text-muted-foreground">{JSON.stringify(output).slice(0, 160)}</p>;
  }
}

function StepDetail({ step }: { step: TraceStep }) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Input</p>
        <pre className="text-xs bg-muted/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">
          {JSON.stringify(step.input, null, 2)}
        </pre>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Output</p>
        <pre className="text-xs bg-muted/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">
          {JSON.stringify(step.output, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function TraceStepRow({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(step.tool);
  const Icon = meta.icon;
  const failed = Boolean(step.output?.error);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border/70 bg-card/40">
        <CollapsibleTrigger className="w-full flex items-start gap-2.5 p-2.5 text-left cursor-pointer rounded-lg transition-colors hover:bg-muted/50 min-h-11">
          <span
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
              failed ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}
          >
            <Icon className="size-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium">{meta.label}</span>
              <code className="text-[10px] text-muted-foreground/70 font-mono">{step.tool}</code>
            </span>
            <span className="block mt-0.5">
              <StepSummary step={step} />
            </span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 mt-1", open && "rotate-180")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-2.5 pb-2.5">
          <StepDetail step={step} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function TracePanel({ trace }: { trace: TraceStep[] }) {
  const [open, setOpen] = useState(false);
  if (!trace || trace.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer min-h-11 sm:min-h-0">
        <Wrench className="size-3.5" />
        Herramientas usadas ({trace.length})
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        {trace.map((step, idx) => (
          <TraceStepRow key={idx} step={step} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
