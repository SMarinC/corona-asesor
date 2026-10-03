import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { Verdict } from "@/lib/domain/compatibility";
import { cn } from "@/lib/utils";

const STYLE: Record<Verdict, { label: string; className: string; Icon: typeof CircleCheck }> = {
  compatible: { label: "Compatible", className: "bg-ok-surface text-ok", Icon: CircleCheck },
  needs_review: { label: "Requiere revisión", className: "bg-review-surface text-review", Icon: TriangleAlert },
  incompatible: { label: "Incompatible", className: "bg-bad-surface text-bad", Icon: CircleX },
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const { label, className: tone, Icon } = STYLE[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

/** A small colored dot for one rule inside a compatibility list. */
export function VerdictDot({ verdict }: { verdict: Verdict }) {
  const tone = { compatible: "bg-ok", needs_review: "bg-review", incompatible: "bg-bad" }[verdict];
  return <span aria-label={STYLE[verdict].label} className={cn("mt-1.5 inline-block size-2 shrink-0 rounded-full", tone)} />;
}
