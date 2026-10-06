"use client";

import Image from "next/image";
import { useState } from "react";
import { Citation } from "@/components/chat/citations-context";
import type { SearchSuppliesData, SupplyResult } from "@/lib/agent/tools/search-supplies";
import type { TileResult } from "@/lib/agent/tools/search-tiles";
import { PRICE_UNIT, type TileSummary } from "@/lib/agent/tools/summaries";
import type { QuotableProduct } from "@/lib/domain/quotable";
import type { TileMaterial } from "@/lib/domain/types";
import { formatCOP, formatFormat, formatNumber } from "@/lib/ui/format";

const VISIBLE = 3;
const UNIT_LABEL = { caja: "por caja", bulto: "por bulto", unidad: "por unidad" } as const;
const MATERIAL_ES: Record<TileMaterial, string> = { ceramic: "cerámica", porcelain: "porcelánico", porcelatech: "PorcelaTech", stoneware: "gres" };
const ATTRIBUTE_ES: Record<string, string> = {
  surface: "superficie",
  indoor: "uso interior",
  outdoor: "uso exterior",
  wetArea: "zona húmeda",
  traffic: "tráfico",
  finish: "acabado",
  design: "diseño",
  tileMaterial: "material compatible",
  jointWidthMm: "rango de junta",
};

export function Price({ price, unit }: { price: number | null; unit: keyof typeof UNIT_LABEL }) {
  if (price === null) return <span className="text-review">Sin precio en el catálogo</span>;
  return (
    <span className="tabular">
      <span className="font-medium text-foreground">{formatCOP(price)}</span> {UNIT_LABEL[unit]}
    </span>
  );
}

/** Decorative: the product name is printed right next to it. */
function Thumb({ src }: { src: string | null }) {
  if (!src) return <span aria-hidden className="size-14 shrink-0 rounded-md bg-muted" />;
  return <Image src={src} alt="" width={56} height={56} sizes="56px" className="size-14 shrink-0 rounded-md bg-muted object-cover" />;
}

function Unknown({ attributes }: { attributes: string[] }) {
  if (attributes.length === 0) return null;
  return (
    <p className="text-xs text-review">
      Sin dato en el catálogo: {attributes.map((a) => ATTRIBUTE_ES[a] ?? a).join(", ")}. Requiere revisión.
    </p>
  );
}

function ShowMore<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, VISIBLE);
  return (
    <>
      <ul className="space-y-2">{shown.map(render)}</ul>
      {items.length > VISIBLE && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-2 text-xs font-medium text-primary hover:underline">
          {expanded ? "Ver menos" : `Ver ${items.length - VISIBLE} más`}
        </button>
      )}
    </>
  );
}

function tileFacts(tile: TileSummary): string {
  const facts = [tile.formatMm ? formatFormat(tile.formatMm) : null, tile.m2PerBox ? `${formatNumber(tile.m2PerBox)} m² por caja` : null, tile.finish];
  return facts.filter(Boolean).join(", ");
}

export function TileRow({ tile, unknown = [] }: { tile: TileSummary; unknown?: string[] }) {
  return (
    <li className="flex gap-3">
      <Thumb src={tile.imageUrl} />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium text-foreground">{tile.name}</p>
        <p className="text-muted-foreground">
          <Price price={tile.price} unit="caja" />
        </p>
        <p className="text-xs text-muted-foreground">{tileFacts(tile)}</p>
        <Unknown attributes={unknown} />
      </div>
    </li>
  );
}

export function TileResults({ results }: { results: TileResult[] }) {
  if (results.length === 0) return <p className="text-sm text-muted-foreground">No hubo resultados con esos filtros.</p>;
  return <ShowMore items={results} render={(tile) => <TileRow key={tile.sku} tile={tile} unknown={tile.unknown} />} />;
}

function supplyFact(item: SupplyResult) {
  if (item.priceUnit === "bulto") {
    const materials = item.compatibleMaterials?.map((m) => MATERIAL_ES[m]).join(", ");
    return (
      <>
        {materials ? `Para ${materials}` : "Materiales sin confirmar"}
        {item.outdoor === true && ", interior y exterior"}
        {item.compatibilityCitationId && <Citation id={item.compatibilityCitationId} />}
      </>
    );
  }
  return (
    <>
      {item.jointMm ? `Juntas de ${formatNumber(item.jointMm.min)} a ${formatNumber(item.jointMm.max)} mm` : "Rango de junta sin confirmar"}
      {item.jointCitationId && <Citation id={item.jointCitationId} />}
    </>
  );
}

export function SupplyResults({ data }: { data: SearchSuppliesData }) {
  if (data.results.length === 0) return <p className="text-sm text-muted-foreground">No hubo resultados con esos filtros.</p>;
  return (
    <ShowMore
      items={data.results}
      render={(item) => (
        <li key={item.sku} className="flex gap-3">
          <Thumb src={item.imageUrl} />
          <div className="min-w-0 space-y-0.5 text-sm">
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-muted-foreground">
              <Price price={item.price} unit={item.priceUnit} />
            </p>
            <p className="text-xs text-muted-foreground">{supplyFact(item)}</p>
            <Unknown attributes={item.unknown} />
          </div>
        </li>
      )}
    />
  );
}

export function ProductDetail({ product }: { product: QuotableProduct }) {
  const unit = PRICE_UNIT[product.kind];
  return (
    <div className="flex gap-3">
      <Thumb src={product.imageUrls[0] ?? null} />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium text-foreground">{product.name}</p>
        <p className="text-muted-foreground">
          <Price price={product.price} unit={unit} />
        </p>
        {product.kind === "tile" && (
          <p className="text-xs text-muted-foreground">
            {[
              product.formatMm ? formatFormat(product.formatMm) : null,
              product.thicknessMm ? `${formatNumber(product.thicknessMm)} mm de espesor` : "espesor sin dato",
              `${formatNumber(product.m2PerBox)} m² por caja`,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
