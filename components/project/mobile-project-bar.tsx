"use client";

import { ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ProjectState } from "@/lib/ui/derive-project";
import { formatCOP } from "@/lib/ui/format";
import { needsReview } from "@/lib/ui/project-view";

function summary(project: ProjectState, busy: boolean): string {
  if (project.quote?.data.total !== undefined) return `Total ${formatCOP(project.quote.data.total)}`;
  if (project.materials) return "Materiales calculados";
  return busy ? "El asesor está trabajando" : "Tu proyecto";
}

/** Small screens: the project collapses into a bar above the input and opens as a sheet. */
export function MobileProjectBar({ project, busy, children }: { project: ProjectState; busy: boolean; children: ReactNode }) {
  if (project.toolCalls === 0) return null;
  const review = project.review.length;
  return (
    <Sheet>
      <SheetTrigger className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 text-sm lg:hidden">
        <span className="font-medium tabular">{summary(project, busy)}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {needsReview(project) ? <span className="text-review">{review > 0 ? `${review} por revisar` : "Requiere revisión"}</span> : "Ver proyecto"}
          <ChevronUp aria-hidden className="size-4" />
        </span>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-5 pb-8">
        <SheetHeader className="px-0">
          <SheetTitle>Tu proyecto</SheetTitle>
          <SheetDescription>Todo lo que calcularon las herramientas, sin cifras escritas por el modelo.</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
