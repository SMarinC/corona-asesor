"""Servidor HTTP (FastAPI) que expone el CoronaAgent (Python) para que lo
consuma el frontend Node/Next.js en web/.

Por qué existe: el agente (orquestador Gemini + tools + DuckDB + Chroma con
búsqueda semántica real) ya funciona completo y probado en Python. En vez de
reimplementarlo en TypeScript (lo que introdujo bugs de integración: rutas,
formatos binarios de Chroma no legibles desde Node, orden de carga de env
vars), este servidor lo envuelve tal cual y el frontend Node solo consume
HTTP — sin duplicar lógica de negocio.

Ejecutar desde la raíz del repo:
    uvicorn api_server:app --reload --port 8000
"""
from __future__ import annotations

import logging
import secrets
from pathlib import Path

from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src.agent.orchestrator import CoronaAgent
from src.knowledge.duckdb_store import DuckDBStore
from src.knowledge.chroma_store import ChromaStore

logger = logging.getLogger(__name__)

app = FastAPI(title="Corona Asesor API")

# El frontend Node corre en otro puerto (3000) durante desarrollo: CORS + el
# permiso explícito de credentials (cookie de sesión) son necesarios.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conexiones de solo lectura, compartidas entre sesiones (igual que
# get_recursos() en app.py): caras de abrir, seguras de compartir.
_duck: DuckDBStore | None = CoronaAgent._try_duck()
_chroma: ChromaStore | None = CoronaAgent._try_chroma()

# Un CoronaAgent (con su propio historial) por sesión de navegador, igual
# que st.session_state en Streamlit. IMPORTANTE: nunca compartir un agente
# entre usuarios distintos.
_sessions: dict[str, CoronaAgent] = {}

SESSION_COOKIE = "corona_session"


def _get_or_create_session(session_id: str | None) -> tuple[str, CoronaAgent]:
    if session_id and session_id in _sessions:
        return session_id, _sessions[session_id]
    new_id = secrets.token_urlsafe(24)
    agente = CoronaAgent(duck=_duck, chroma=_chroma)
    _sessions[new_id] = agente
    return new_id, agente


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    texto: str
    trace: list[dict]
    truncado: bool = False
    error: str | None = None


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, response: Response, corona_session: str | None = Cookie(default=None)):
    session_id, agente = _get_or_create_session(corona_session)
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax")
    resultado = agente.ask(req.message)
    return ChatResponse(**resultado)


@app.post("/reset")
def reset(response: Response, corona_session: str | None = Cookie(default=None)):
    if corona_session and corona_session in _sessions:
        _sessions[corona_session].reset()
    session_id, _ = _get_or_create_session(corona_session)
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax")
    return {"ok": True}


@app.get("/cotizacion/{filename}")
def descargar_cotizacion(filename: str):
    from src import config

    ruta = Path(config.COTIZACIONES_DIR) / filename
    # Evita path traversal: el archivo resuelto debe seguir dentro de la carpeta.
    if ruta.resolve().parent != Path(config.COTIZACIONES_DIR).resolve() or not ruta.exists():
        raise HTTPException(status_code=404, detail="Cotización no encontrada.")
    return FileResponse(ruta, media_type="application/pdf", filename=filename)


@app.get("/health")
def health():
    return {"ok": True, "duck": _duck is not None, "chroma": _chroma is not None}
