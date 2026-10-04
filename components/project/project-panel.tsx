"use client";

import { TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Citation } from "@/components/chat/citations-context";
import { CompatibilityResult } from "@/components/tools/analysis-results";
import { TileRow } from "@/components/tools/product-results";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import type { ProjectConditionsView, ProjectState } from "@/lib/ui/derive-project";
import { formatCOP, formatM2, formatNumber, formatQuantity } from "@/lib/ui/format";
import { needsReview, tileMismatch } from "@/lib/ui/project-view";
import type { Timings } from "@/lib/ui/trace";
import { cn } from "@/lib/utils";
import { DownloadQuoteButton } from "./download-quote-button";
import { FloorPlan } from "./floor-plan";
import { TraceTimeline } from "./trace-timeline";

function Section({ title, empty, children, tone }: { title: string; empty?: string; children?: ReactNode; tone?: "review" }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3 py-5 first:pt-0">
      <h3 id={headingId} className={cn("text-sm font-semibold", tone === "review" && "flex items-center gap-1.5 text-review")}>
        {tone === "review" && <TriangleAlert aria-hidden className="size-4" />}
        {title}
      </h3>
      {children ?? <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function conditionsText(c: ProjectConditionsView): string {
  const traffic = c.traffic ? `tráfico ${{ low: "bajo", medium: "medio", high: "alto" }[c.traffic]}` : null;
  return [
    c.surface === "floor" ? "Piso" : "Pared",
    c.environment === "indoor" ? "interior" : "exterior",
    c.wetArea ? "zona húmeda" : "zona seca",
    traffic,
    c.jointWidthMm !== null ? `junta de ${formatNumber(c.jointWidthMm)} mm` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Every review item in the order deriveProject gives it. The PDF reads the same list, so the two always agree. */
function ReviewSection({ project }: { project: ProjectState }) {
  return (
    <Section title="Requiere revisión" tone="review">
      <ul className="list-disc space-y-1 rounded-lg bg-review-surface py-2.5 pr-3 pl-8 text-sm text-review marker:text-review/60">
        {project.review.map((item) => (
          <li key={`${item.tool}-${item.field}`}>{item.reason}</li>
        ))}
      </ul>
    </Section>
  );
}

function SpaceSection({ project }: { project: ProjectState }) {
  const { space, materials, tile } = project;
  if (!space) return null;
  const laidTile = materials?.tile ?? null;
  const label = laidTile
    ? `${formatQuantity(laidTile.boxes, "caja")} cubren ${formatM2(laidTile.coveredM2)} de ${formatM2(space.areaWithWasteM2)} con desperdicio`
    : `${formatM2(space.areaM2)}, ${formatM2(space.areaWithWasteM2)} con ${formatNumber(space.wastePct * 100)} % de desperdicio`;
  // project.tile follows the last tile any tool touched; only draw its format when it is the tile the boxes were computed for.
  const format = laidTile && tile?.sku === laidTile.sku ? tile.formatMm : null;
  return (
    <div className="space-y-2">
      <FloorPlan lengthM={space.lengthM} widthM={space.widthM} format={format} laid={laidTile !== null} label={label} />
      {project.conditions && <p className="text-sm text-muted-foreground">{conditionsText(project.conditions)}</p>}
    </div>
  );
}

function MaterialsSection({ project }: { project: ProjectState }) {
  const m = project.materials;
  if (!m) return null;
  const rows = [
    m.tile && { name: m.tile.name, qty: formatQuantity(m.tile.boxes, "caja"), cite: m.tile.citationId ? [m.tile.citationId] : [] },
    m.adhesive && { name: m.adhesive.name, qty: formatQuantity(m.adhesive.bags, "bulto"), cite: m.adhesive.citationIds },
    m.grout && { name: m.grout.name, qty: formatQuantity(m.grout.units, "unidad"), cite: [] as string[] },
  ].filter((row): row is { name: string; qty: string; cite: string[] } => Boolean(row));
  return (
    <div className="space-y-3">
      {m.tile && (
        <p className="text-sm text-muted-foreground">
          Calculado para {m.tile.name} ({m.tile.sku}).
        </p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.name} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                {row.name}
                {row.cite.map((id) => (
                  <Citation key={id} id={id} />
                ))}
              </span>
              <span className="shrink-0 font-medium tabular">{row.qty}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompatibilitySection({ project }: { project: ProjectState }) {
  if (!project.compatibility) return null;
  const mismatch = tileMismatch(project);
  return (
    <div className="space-y-3">
      {mismatch && (
        <p className="rounded-lg bg-review-surface px-3 py-2 text-sm text-review">
          La compatibilidad se verificó con {mismatch.checked.name} ({mismatch.checked.sku}), otro revestimiento distinto al de los materiales.
        </p>
      )}
      <CompatibilityResult data={project.compatibility} />
    </div>
  );
}

/** `flagged`: the quote needs review, so fitting the budget is not a verified result and must not look like one. */
function BudgetLine({ budget, withinBudget, difference, flagged }: { budget: number | null; withinBudget: boolean | null; difference: number | null; flagged: boolean }) {
  if (budget === null) return null;
  if (withinBudget === null || difference === null) {
    return <p className="text-sm text-review">Presupuesto de {formatCOP(budget)}: requiere revisión porque falta algún precio.</p>;
  }
  return withinBudget ? (
    <p className={cn("text-sm tabular", flagged ? "text-muted-foreground" : "text-ok")}>
      Dentro del presupuesto de {formatCOP(budget)}. Quedan {formatCOP(difference)}.
    </p>
  ) : (
    <p className="text-sm text-review tabular">
      Supera el presupuesto de {formatCOP(budget)} por {formatCOP(-difference)}.
    </p>
  );
}

function QuoteSection({ project }: { project: ProjectState }) {
  const quote = project.quote;
  if (!quote) return null;
  const { data, lineChecks } = quote;
  // A stale quote keeps needsReview false, so the flag follows the shared review state, never quote.needsReview alone.
  const flagged = needsReview(project);
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Líneas de la cotización</caption>
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="pb-1.5 font-normal">Producto</th>
            <th className="pb-1.5 text-right font-normal">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(data.lines ?? []).map((line) => (
            <tr key={line.sku} className={cn(lineChecks[line.sku] !== "computed" && "text-review")}>
              <td className="py-2 pr-3">
                <span className="block">{line.name}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {formatQuantity(line.quantity, line.unit)}
                  {line.unitPrice !== null && ` a ${formatCOP(line.unitPrice)} por ${line.unit}`}
                </span>
              </td>
              <td className="py-2 text-right align-top tabular">{line.subtotal === null ? "Sin precio" : formatCOP(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-foreground/80">
            <td className="pt-2.5 font-semibold">
              Total
              {flagged && <span className="ml-2 text-xs font-medium text-review">Requiere revisión</span>}
            </td>
            <td className="pt-2.5 text-right text-lg font-semibold tabular">{formatCOP(data.total ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
      <BudgetLine budget={data.budget ?? null} withinBudget={data.withinBudget ?? null} difference={data.difference ?? null} flagged={flagged} />
      {data.priceNote && <p className="text-xs text-muted-foreground">{data.priceNote}</p>}
      <DownloadQuoteButton project={project} />
    </div>
  );
}

/** "Tu proyecto": everything here is read from tool outputs by deriveProject, never from the model's text. */
export function ProjectPanel({ project, messages, timings }: { project: ProjectState; messages: CoronaUIMessage[]; timings: Timings }) {
  return (
    <div className="divide-y divide-border">
      {needsReview(project) && project.review.length > 0 && <ReviewSection project={project} />}
      <Section title="Espacio" empty="Aparece cuando el asesor calcule el área.">
        {project.space ? <SpaceSection project={project} /> : null}
      </Section>
      <Section title="Revestimiento" empty="Aquí verás el revestimiento elegido.">
        {project.tile ? (
          <ul>
            <TileRow tile={project.tile} />
          </ul>
        ) : null}
      </Section>
      <Section title="Materiales" empty="Cajas, bultos de pegante y boquilla, calculados con datos del catálogo.">
        {project.materials ? <MaterialsSection project={project} /> : null}
      </Section>
      <Section title="Compatibilidad" empty="Revestimiento, pegante y boquilla se verifican contra tu espacio.">
        {project.compatibility ? <CompatibilitySection project={project} /> : null}
      </Section>
      <Section title="Total" empty="La cotización usa solo precios del catálogo.">
        {project.quote ? <QuoteSection project={project} /> : null}
      </Section>
      <div className="py-5">
        <TraceTimeline messages={messages} timings={timings} />
      </div>
    </div>
  );
}
