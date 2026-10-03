"use client";

import type { ReactNode } from "react";
import { type CoronaToolPart, isToolPartOf, type ToolPhase, toolLabel, toolPhase, toolResult } from "@/lib/ui/tool-parts";
import { CompatibilityResult, MaterialsSummary, QuoteSummary, SheetHits } from "./analysis-results";
import { ProductDetail, SupplyResults, TileResults } from "./product-results";
import { ReviewNotice } from "./review-notice";
import { ToolStep } from "./tool-step";

/** Spanish message for a failed call. SDK errors carry English text, so they get a plain sentence. */
function errorText(part: CoronaToolPart): string {
  if (part.state === "output-available") {
    const output = part.output as { status?: string; message?: string };
    if (output.status === "error" && output.message) return output.message;
  }
  return "La herramienta no pudo completar la consulta.";
}

function body(part: CoronaToolPart): ReactNode {
  if (isToolPartOf(part, "searchTiles")) {
    const result = toolResult(part);
    return result?.status === "ok" ? <TileResults results={result.data.results} /> : null;
  }
  if (isToolPartOf(part, "searchSupplies")) {
    const result = toolResult(part);
    return result?.status === "ok" ? <SupplyResults data={result.data} /> : null;
  }
  if (isToolPartOf(part, "getProduct")) {
    const result = toolResult(part);
    return result?.status === "ok" ? <ProductDetail product={result.data.product} /> : null;
  }
  if (isToolPartOf(part, "searchTechnicalSheets")) {
    const result = toolResult(part);
    return result?.status === "ok" ? <SheetHits data={result.data} /> : null;
  }
  if (isToolPartOf(part, "computeMaterials")) {
    const result = toolResult(part);
    if (!result || result.status === "error") return null;
    return (
      <div className="space-y-2">
        <MaterialsSummary data={result.data} />
        {result.status === "needs_review" && <ReviewNotice reasons={result.missing.map((m) => m.reason)} />}
      </div>
    );
  }
  if (isToolPartOf(part, "checkCompatibility")) {
    const result = toolResult(part);
    return result?.status === "ok" ? <CompatibilityResult data={result.data} /> : null;
  }
  if (isToolPartOf(part, "buildQuote")) {
    const result = toolResult(part);
    if (!result || result.status === "error") return null;
    return (
      <div className="space-y-2">
        <QuoteSummary data={result.data} />
        {result.status === "needs_review" && <ReviewNotice reasons={result.missing.map((m) => m.reason)} />}
      </div>
    );
  }
  return null;
}

/** A finished compatibility check whose verdict is not "compatible" must not read as a success. */
function verdictStep(part: CoronaToolPart, phase: ToolPhase): { label: string; phase: ToolPhase } | null {
  if (phase !== "done" || !isToolPartOf(part, "checkCompatibility")) return null;
  const result = toolResult(part);
  if (result?.status !== "ok") return null;
  if (result.data.verdict === "needs_review") return { label: "Compatibilidad: requiere revisión", phase: "review" };
  if (result.data.verdict === "incompatible") return { label: "Compatibilidad: incompatible", phase: "error" };
  return null;
}

/** A tool call as one line of the work log, with what it found once it finishes. */
export function ToolCard({ part }: { part: CoronaToolPart }) {
  const phase = toolPhase(part);
  const { label, phase: shown } = verdictStep(part, phase) ?? { label: toolLabel(part), phase };
  return (
    <ToolStep label={label} phase={shown}>
      {phase === "error" ? <p className="text-sm text-muted-foreground">{errorText(part)}</p> : body(part)}
    </ToolStep>
  );
}
