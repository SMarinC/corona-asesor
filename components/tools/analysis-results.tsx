"use client";

import { ChevronDown } from "lucide-react";
import { Citation } from "@/components/chat/citations-context";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { QuoteData } from "@/lib/agent/tools/build-quote";
import type { CompatibilityData } from "@/lib/agent/tools/check-compatibility";
import type { MaterialsData, RejectedOverride } from "@/lib/agent/tools/compute-materials";
import type { SearchTechnicalSheetsData } from "@/lib/agent/tools/search-technical-sheets";
import { formatCOP, formatM2, formatNumber, formatQuantity } from "@/lib/ui/format";
import { VerdictBadge, VerdictDot } from "./verdict-badge";

export function MaterialsSummary({ data }: { data: Partial<MaterialsData> }) {
  const rows: { label: string; value: string; detail: string; citations: string[] }[] = [];
  if (data.tile) {
    rows.push({ label: data.tile.name, value: formatQuantity(data.tile.boxes, "caja"), detail: `cubren ${formatM2(data.tile.coveredM2)}`, citations: data.tile.citationId ? [data.tile.citationId] : [] });
  }
  if (data.adhesive) {
    rows.push({ label: data.adhesive.name, value: formatQuantity(data.adhesive.bags, "bulto"), detail: `${formatNumber(data.adhesive.kg)} kg`, citations: data.adhesive.citationIds });
  }
  if (data.grout) {
    rows.push({ label: data.grout.name, value: formatQuantity(data.grout.units, "unidad"), detail: `${formatNumber(data.grout.kg)} kg estimados`, citations: [] });
  }
  return (
    <div className="space-y-2 text-sm">
      {data.area && (
        <p className="text-muted-foreground">
          Área de {formatM2(data.area.areaM2)}, {formatM2(data.area.areaWithWasteM2)} con {formatNumber(data.area.wastePct * 100)} % de desperdicio.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {rows.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span>{row.label}</span>
                {row.citations.map((id) => (
                  <Citation key={id} id={id} />
                ))}
              </span>
              <span className="shrink-0 text-right tabular">
                <span className="font-medium">{row.value}</span> <span className="text-xs text-muted-foreground">{row.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <RejectedOverrides rejected={data.rejectedOverrides ?? []} />
    </div>
  );
}

function RejectedOverrides({ rejected }: { rejected: RejectedOverride[] }) {
  if (rejected.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {rejected.map((r) => (
        <li key={`${r.field}-${r.citationId}`}>
          Dato citado descartado ({r.citationId}): {r.message}
        </li>
      ))}
    </ul>
  );
}

export function CompatibilityResult({ data }: { data: CompatibilityData }) {
  return (
    <Collapsible>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <VerdictBadge verdict={data.verdict} />
        <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Ver las {data.checks.length} reglas
          <ChevronDown aria-hidden className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="mt-2 space-y-1.5 text-sm">
          {data.checks.map((check) => (
            <li key={check.rule} className="flex gap-2">
              <VerdictDot verdict={check.verdict} />
              <span>
                <span className="font-medium">{check.rule}.</span> {check.message}
                {check.citationId && <Citation id={check.citationId} />}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function QuoteSummary({ data }: { data: Partial<QuoteData> }) {
  if (data.total === undefined) return null;
  return (
    <p className="text-sm text-muted-foreground tabular">
      Total <span className="font-medium text-foreground">{formatCOP(data.total)}</span>
      {data.withinBudget === true && data.difference !== null && data.difference !== undefined && `, dentro del presupuesto (quedan ${formatCOP(data.difference)})`}
      {data.withinBudget === false && data.difference !== null && data.difference !== undefined && (
        <span className="text-review">, supera el presupuesto por {formatCOP(-data.difference)}</span>
      )}
      . El detalle está en Tu proyecto.
    </p>
  );
}

export function SheetHits({ data }: { data: SearchTechnicalSheetsData }) {
  if (data.hits.length === 0) return <p className="text-sm text-muted-foreground">Las fichas no tienen fragmentos sobre eso.</p>;
  return (
    <div className="space-y-2 text-sm">
      {data.mode === "keyword" && <p className="text-xs text-muted-foreground">Búsqueda por palabras clave: la búsqueda semántica no estaba disponible.</p>}
      <ul className="space-y-2">
        {data.hits.map((hit) => (
          <li key={hit.citationId} className="border-l-2 border-grout pl-3">
            <p className="line-clamp-3 text-muted-foreground">{hit.text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hit.section.toLowerCase()} <Citation id={hit.citationId} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
