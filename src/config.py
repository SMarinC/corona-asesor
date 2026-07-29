"""Configuración central del proyecto.

Lee variables de entorno (.env) y expone rutas y parámetros como constantes.
No contiene secretos hardcodeados: todo sale del entorno.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Raíz del repositorio (…/corona-agent)
ROOT = Path(__file__).resolve().parent.parent


def _path(env_key: str, default: str) -> Path:
    """Resuelve una ruta desde el entorno, relativa a la raíz del repo."""
    value = os.getenv(env_key, default)
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


# --- LLM ---
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
# Tope de tokens de salida por respuesta. Una cotización completa (desglose +
# alternativas + evidencia) puede necesitar más que el default de Gemini;
# se sube pero se deja acotado (no ilimitado) para no disparar costo/latencia.
GEMINI_MAX_TOKENS = int(os.getenv("GEMINI_MAX_TOKENS", "8192"))

# --- Embeddings de Chroma (la colección se construyó con VoyageAI) ---
# Necesaria para la búsqueda SEMÁNTICA en las fichas. Sin ella, ChromaStore
# hace un fallback por palabra clave (full-text), sin romper la demo.
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "")

# --- Rutas de datos ---
DATA_RAW_DIR = _path("DATA_RAW_DIR", "data/raw")
DATA_FICHAS_DIR = _path("DATA_FICHAS_DIR", "data/fichas")
DUCKDB_PATH = _path("DUCKDB_PATH", "data/processed/corona.duckdb")
CHROMA_PATH = _path("CHROMA_PATH", "data/processed/chroma")

# Contexto institucional/navegación (se inyecta en el system prompt, no es RAG)
CONTEXTO_PATH = _path("CONTEXTO_PATH", "data/contexto_agente.json")
# Carpeta donde se guardan las cotizaciones PDF generadas
COTIZACIONES_DIR = _path("COTIZACIONES_DIR", "data/cotizaciones")

# Logo para la cotización PDF. Si existe este archivo se usa; si no, se dibuja
# un escudo/corona de marcador. Pon aquí el logo oficial (PNG con fondo
# transparente, idealmente blanco) para la versión final.
LOGO_PATH = _path("LOGO_PATH", "data/assets/logo_corona.png")

# --- Parámetros de negocio ---
DESPERDICIO_DEFECTO = float(os.getenv("DESPERDICIO_DEFECTO", "0.10"))

# Nombre de la colección de Chroma (tal como la construyó el equipo de datos)
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "corona_fichas")


def assert_llm_ready() -> None:
    """Falla temprano y con mensaje claro si falta la API key."""
    if not GOOGLE_API_KEY:
        raise RuntimeError(
            "Falta GOOGLE_API_KEY. Copia .env.example a .env y añade tu clave."
        )


def cargar_contexto_institucional() -> dict:
    """Carga data/contexto_agente.json ya parseado (dict vacío si no existe o
    está corrupto). Fuente única de datos institucionales (contacto, marcas,
    tiendas…): úsala en vez de repetir estos datos a mano en otros módulos
    (p. ej. el pie de página de la cotización PDF)."""
    if not CONTEXTO_PATH.exists():
        return {}
    try:
        return json.loads(CONTEXTO_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}
