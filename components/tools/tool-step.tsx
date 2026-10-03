import { Check, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolPhase } from "@/lib/ui/tool-parts";
import { cn } from "@/lib/utils";

function PhaseIcon({ phase }: { phase: ToolPhase }) {
  switch (phase) {
    case "running":
      return <LoaderCircle aria-hidden className="size-4 animate-spin text-primary motion-reduce:animate-none" />;
    case "done":
      return <Check aria-hidden className="size-4 text-ok" />;
    case "review":
      return <TriangleAlert aria-hidden className="size-4 text-review" />;
    case "error":
      return <CircleAlert aria-hidden className="size-4 text-bad" />;
  }
}

/** One line of the agent's work log: what it is doing, its state, and what it found underneath. */
export function ToolStep({ label, phase, children }: { label: string; phase: ToolPhase; children?: ReactNode }) {
  return (
    <li className="relative pl-7" data-phase={phase}>
      <span className="absolute top-0.5 left-0 grid size-5 place-items-center rounded-full bg-card ring-1 ring-border">
        <PhaseIcon phase={phase} />
      </span>
      <p className={cn("text-sm", phase === "running" ? "text-foreground" : "text-muted-foreground")}>{label}</p>
      {children && <div className="mt-2 mb-1">{children}</div>}
    </li>
  );
}
