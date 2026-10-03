"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { FormatMm } from "@/lib/domain/types";
import { formatNumber } from "@/lib/ui/format";

export interface FloorPlanProps {
  lengthM: number;
  widthM: number;
  /** Tile size; without it the plan shows the bare outline. */
  format: FormatMm | null;
  /** True once computeMaterials returned boxes: the tiles are laid. */
  laid: boolean;
  label: string;
}

const VIEW_W = 320;
const MAX_H = 200;
const PAD = 22;

/**
 * The room drawn to scale with the chosen tile at its real size. When the quantities arrive, the tiles are laid
 * from one wall to the other: the one moment of motion in the interface, and it shows what was just computed.
 */
export function FloorPlan({ lengthM, widthM, format, laid, label }: FloorPlanProps) {
  const reduceMotion = useReducedMotion();
  // The plan renders twice on small screens (panel and sheet), so the pattern id must be unique.
  const patternId = `tiles-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const scale = Math.min((VIEW_W - PAD * 2) / lengthM, (MAX_H - PAD * 2) / widthM);
  const w = lengthM * scale;
  const h = widthM * scale;
  const viewH = h + PAD * 2;
  const x = (VIEW_W - w) / 2;
  const y = PAD;
  const tileW = format ? (format.length / 1000) * scale : 0;
  const tileH = format ? (format.width / 1000) * scale : 0;
  const patterned = tileW > 1.5 && tileH > 1.5;

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${VIEW_W} ${viewH}`} role="img" aria-label={label} className="block w-full text-grout">
        {format && patterned && (
          <defs>
            <pattern id={patternId} x={x} y={y} width={tileW} height={tileH} patternUnits="userSpaceOnUse">
              <rect width={tileW} height={tileH} className="fill-accent" />
              <path d={`M ${tileW} 0 V ${tileH} M 0 ${tileH} H ${tileW}`} className="stroke-grout" strokeWidth={1} fill="none" />
            </pattern>
          </defs>
        )}
        <rect x={x} y={y} width={w} height={h} rx={2} className="fill-card stroke-input" strokeWidth={1.5} strokeDasharray={laid ? undefined : "5 4"} />
        {laid && format && (
          <motion.rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={2}
            fill={patterned ? `url(#${patternId})` : "var(--accent)"}
            initial={reduceMotion ? false : { clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        <text x={x + w / 2} y={y + h + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {formatNumber(lengthM)} m
        </text>
        <text x={x - 8} y={y + h / 2} textAnchor="middle" transform={`rotate(-90 ${x - 8} ${y + h / 2})`} className="fill-muted-foreground text-[11px]">
          {formatNumber(widthM)} m
        </text>
      </svg>
      <figcaption className="text-sm text-muted-foreground tabular">{label}</figcaption>
    </figure>
  );
}
