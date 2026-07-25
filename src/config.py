"""Configuración central del proyecto.

Lee variables de entorno (.env) y expone rutas y parámetros como constantes.
No contiene secretos hardcodeados: todo sale del entorno.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Raíz del repositorio (…/corona-agent)
ROOT = Path(__file__).resolve().parent.parent


def _path(env_key: str, default: str) -> Path:
    """Resuelve una ruta desde el entorno, relativa a la raíz del repo."""
    value = os.getenv(env_key, default)
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


# --- LLM ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

# --- Embeddings de Chroma (la colección se construyó con VoyageAI) ---
# Necesaria para la búsqueda SEMÁNTICA en las fichas. Sin ella, ChromaStore
# hace un fallback por palabra clave (full-text), sin romper la demo.
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "")

# --- Rutas de datos ---
DATA_RAW_DIR = _path("DATA_RAW_DIR", "data/raw")
DATA_FICHAS_DIR = _path("DATA_FICHAS_DIR", "data/fichas")
DUCKDB_PATH = _path("DUCKDB_PATH", "data/processed/corona.duckdb")
CHROMA_PATH = _path("CHROMA_PATH", "data/processed/chroma")

# --- Parámetros de negocio ---
DESPERDICIO_DEFECTO = float(os.getenv("DESPERDICIO_DEFECTO", "0.10"))

# Nombre de la colección de Chroma (tal como la construyó el equipo de datos)
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "corona_fichas")


def assert_llm_ready() -> None:
    """Falla temprano y con mensaje claro si falta la API key."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "Falta ANTHROPIC_API_KEY. Copia .env.example a .env y añade tu clave."
        )
