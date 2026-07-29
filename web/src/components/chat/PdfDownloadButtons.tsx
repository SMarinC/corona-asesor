"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TraceStep } from "@/lib/types/chat";

// El backend Python devuelve la ruta completa del archivo en disco; para la
// descarga solo necesitamos el nombre (el servidor Python resuelve el resto
// contra COTIZACIONES_DIR, sin exponer rutas del sistema de archivos).
function nombreArchivo(ruta: string): string {
  return ruta.split(/[\\/]/).pop() || ruta;
}

export function PdfDownloadButtons({ trace }: { trace: TraceStep[] }) {
  const pdfs = trace.filter((s) => s.tool === "generar_cotizacion_pdf" && s.output?.archivo);
  if (pdfs.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {pdfs.map((s, idx) => (
        <Button
          key={idx}
          size="sm"
          className="gap-1.5"
          nativeButton={false}
          render={<a href={`/api/cotizacion/${nombreArchivo(s.output.archivo)}`} download />}
        >
          <FileDown className="size-4" />
          Descargar cotización (PDF)
        </Button>
      ))}
    </div>
  );
}
