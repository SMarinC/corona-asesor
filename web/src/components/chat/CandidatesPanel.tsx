"use client";

import { ExternalLink, PackageSearch } from "lucide-react";
import type { Producto } from "@/lib/types/chat";
import { Badge } from "@/components/ui/badge";

function fmtCOP(v: unknown): string | null {
  if (typeof v !== "number") return null;
  return v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function ProductCard({ producto }: { producto: Producto }) {
  const precio = fmtCOP(producto.precio);
  return (
    <div className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50">
      <div className="flex gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {producto.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagen} alt={producto.nombre} className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <PackageSearch className="size-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug line-clamp-2">{producto.nombre}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {producto.acabado && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {producto.acabado}
              </Badge>
            )}
            {producto.diseno && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {producto.diseno}
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {precio ? (
              <span className="text-sm font-semibold text-primary">{precio}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Precio a confirmar</span>
            )}
            {producto.url && (
              <a
                href={producto.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors min-h-11 sm:min-h-0"
                aria-label={`Ver ${producto.nombre} en corona.co`}
              >
                Ver <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CandidatesPanel({ productos }: { productos: Producto[] }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Del catálogo</p>
        <h3 className="font-heading text-base font-semibold -mt-0.5">Opciones que concuerdan</h3>
      </div>
      {productos.length === 0 ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Aquí verás las opciones sugeridas apenas el agente busque pisos o paredes para tu cotización.
        </p>
      ) : (
        <div className="space-y-2.5">
          {productos.slice(0, 6).map((p) => (
            <ProductCard key={p.sku} producto={p} />
          ))}
        </div>
      )}
    </div>
  );
}
