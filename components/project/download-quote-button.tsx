"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectState } from "@/lib/ui/derive-project";

type Status = "idle" | "working" | "failed";

/** Builds the PDF in the browser on demand; the renderer is loaded only when someone asks for it. */
export function DownloadQuoteButton({ project }: { project: ProjectState }) {
  const [status, setStatus] = useState<Status>("idle");

  const download = async () => {
    setStatus("working");
    try {
      const [{ pdf }, { QuotePdf }] = await Promise.all([import("@react-pdf/renderer"), import("./quote-pdf")]);
      const logoSrc = new URL("/corona-logo.png", window.location.origin).href;
      const blob = await pdf(<QuotePdf project={project} logoSrc={logoSrc} generatedAt={new Date()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cotizacion-asesor-corona.pdf";
      link.click();
      // Some Safari and Firefox versions cancel the download if the URL is revoked right after click().
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="space-y-1.5">
      <Button onClick={download} disabled={status === "working"} className="w-full" size="lg">
        {status === "working" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Download aria-hidden />}
        {status === "working" ? "Generando el PDF…" : "Descargar cotización en PDF"}
      </Button>
      {status === "failed" && (
        <p role="status" className="text-xs text-bad">
          No se pudo generar el PDF. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
