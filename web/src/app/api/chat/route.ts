import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy hacia el backend Python (api_server.py, FastAPI) que envuelve el
 * CoronaAgent real: orquestador Gemini + tools + DuckDB + Chroma con
 * búsqueda semántica real (VoyageAI). Node no reimplementa esa lógica, solo
 * reenvía la petición y la cookie de sesión.
 *
 * Requiere `uvicorn api_server:app --port 8000` corriendo (ver web/README.md).
 */
export const dynamic = "force-dynamic";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
const COOKIE_NAME = "corona_session";

export async function POST(req: NextRequest) {
  let body: { message?: string; reset?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
  const cookieHeader = sessionCookie ? `${COOKIE_NAME}=${sessionCookie}` : "";

  const endpoint = body.reset ? "/reset" : "/chat";
  const payload = body.reset ? {} : { message: (body.message || "").trim() };

  if (!body.reset && !payload.message) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${PYTHON_API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const data = await upstream.json();
    const res = NextResponse.json(data, { status: upstream.status });

    // Propaga la cookie de sesión que puso el backend Python (Set-Cookie).
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/corona_session=([^;]+)/);
      if (match) {
        res.cookies.set(COOKIE_NAME, match[1], { httpOnly: true, sameSite: "lax" });
      }
    }
    return res;
  } catch (e) {
    console.error("Error hablando con el backend Python:", e);
    return NextResponse.json(
      {
        texto: "No pude conectar con el agente. Verifica que el backend Python (uvicorn) esté corriendo en el puerto 8000.",
        trace: [],
        error: String(e),
      },
      { status: 200 }
    );
  }
}
