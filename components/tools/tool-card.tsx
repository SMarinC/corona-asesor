"use client";

import type { ReactNode } from "react";
import { type CoronaToolPart, isToolPartOf, toolLabel, toolPhase, toolResult } from "@/lib/ui/tool-parts";
import { CompatibilityResult, MaterialsSummary, QuoteSummary, SheetHits } from "./analysis-results";
import { ProductDetail, SupplyResults, TileResults } from "./product-results";
import { ReviewNotice } from "./review-notice";
import { ToolStep } from "./tool-step";

/** Spanish message for a failed call. SDK rejections carry English validation text, so they get a plain sentence. */
function errorText(part: CoronaToolPart): string {
  if (part.state === "output-available") {
    const output = part.output as { status?: string; message?: string };
    if (output.status === "error" && output.message) return output.message;
  }
  return "La herramienta rechazó los datos; el asesor puede corregir la llamada.";
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

/** A tool call as one line of the work log, with what it found once it finishes. */
export function ToolCard({ part }: { part: CoronaToolPart }) {
  const phase = toolPhase(part);
  return (
    <ToolStep label={toolLabel(part)} phase={phase}>
      {phase === "error" ? <p className="text-sm text-muted-foreground">{errorText(part)}</p> : body(part)}
    </ToolStep>
  );
}
