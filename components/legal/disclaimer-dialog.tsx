"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CREDITS, DATA_USE_NOTE, DISCLAIMER, SOURCE_URL } from "@/lib/ui/legal";

/** "Demo académica": the chip in the header opens the full disclaimer, credits and data-use note. */
export function DisclaimerDialog({ trigger }: { trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sobre esta demo</DialogTitle>
          <DialogDescription>{DISCLAIMER[0]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed">
          {DISCLAIMER.slice(1).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="rounded-lg bg-muted px-3 py-2.5">{DATA_USE_NOTE}</p>
          <h3 className="pt-1 font-semibold">Créditos</h3>
          <p>{CREDITS}</p>
          <p>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
              Ver el código fuente<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
