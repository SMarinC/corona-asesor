import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy hacia el backend Python: sirve el PDF de cotización generado por
 * `generar_cotizacion_pdf`. El `id` aquí es el nombre de archivo real que
 * devuelve esa tool en el trace (ver PdfDownloadButtons.tsx).
 */
export const dynamic = "force-dynamic";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cotizacion/[id]">) {
  const { id } = await ctx.params;

  try {
    const upstream = await fetch(`${PYTHON_API_URL}/cotizacion/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Cotización no encontrada." }, { status: upstream.status });
    }
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": upstream.headers.get("content-disposition") || `attachment; filename="${id}"`,
      },
    });
  } catch (e) {
    console.error("Error descargando cotización del backend Python:", e);
    return NextResponse.json({ error: "No pude conectar con el backend Python." }, { status: 502 });
  }
}
