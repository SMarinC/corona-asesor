import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** The "Requiere revisión" block: what is missing and why, never a guessed value. */
export function ReviewNotice({ reasons, className }: { reasons: string[]; className?: string }) {
  if (reasons.length === 0) return null;
  return (
    <div className={cn("rounded-lg bg-review-surface px-3 py-2.5 text-sm text-review", className)}>
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert aria-hidden className="size-4" />
        Requiere revisión
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 marker:text-review/60">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
