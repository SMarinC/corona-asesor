"""Capa de conocimiento semántico sobre ChromaDB (colección `corona_fichas`).

La colección fue construida con embeddings de **VoyageAI** (`voyage-4-large`,
1024 dim). Para búsqueda SEMÁNTICA se necesita `VOYAGE_API_KEY` en el entorno
(y el paquete `voyageai`). Si no está disponible, se hace un **fallback por
palabra clave** (full-text `$contains`) que no requiere embeddings — así la demo
siempre puede mostrar evidencia de las fichas técnicas.

Metadatos por fragmento: sku, category, subcategory, pdf_id, section, doc_type.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import chromadb

from src import config

logger = logging.getLogger(__name__)

_STOP = {
    "para", "como", "cual", "cuales", "este", "esta", "estos", "una", "unos",
    "unas", "con", "sin", "los", "las", "del", "que", "por", "más", "mas",
    "sobre", "muy", "pero", "según", "segun", "tiene", "cuánto", "cuanto",
    "necesito", "quiero", "puede", "debe", "revestimiento", "producto",
}


class ChromaStore:
    def __init__(self, path: Path | str | None = None, collection: str | None = None):
        self.path = Path(path or config.CHROMA_PATH)
        self.collection_name = collection or config.CHROMA_COLLECTION
        self.client = chromadb.PersistentClient(path=str(self.path))
        # get_collection abre la colección con su config guardada (voyage).
        # No falla aunque no haya VOYAGE_API_KEY: el error aparece recién al
        # intentar embeder una consulta, y ahí caemos al fallback por texto.
        self.collection = self.client.get_collection(self.collection_name)
        self.semantic_ok = bool(config.VOYAGE_API_KEY)

    # ------------------------------------------------------------------ #
    def buscar(
        self,
        consulta: str,
        n_results: int = 4,
        filtro: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Devuelve fragmentos de fichas relevantes con su metadato (para citar)."""
        if self.collection.count() == 0:
            return []

        # 1) Semántico (si hay VOYAGE_API_KEY). Si algo falla, cae al fallback.
        if self.semantic_ok:
            try:
                res = self.collection.query(
                    query_texts=[consulta],
                    n_results=n_results,
                    where=filtro or None,
                    include=["documents", "metadatas", "distances"],
                )
                return self._fmt_query(res, modo="semantico")
            except Exception as e:  # noqa: BLE001
                logger.warning("Búsqueda semántica falló (%s); usando fallback por texto.", e)

        # 2) Fallback por palabra clave (no requiere embeddings).
        return self._keyword_fallback(consulta, n_results, filtro)

    # ------------------------------------------------------------------ #
    def _keyword_fallback(self, consulta, n_results, filtro):
        # Si hay filtro por sku, devolver directamente secciones de ese producto.
        if filtro and filtro.get("sku"):
            r = self.collection.get(where=filtro, limit=n_results,
                                    include=["documents", "metadatas"])
            return self._fmt_get(r, modo="por_sku")

        # Buscar por las palabras más significativas de la consulta.
        palabras = [w for w in re.findall(r"[\wáéíóúñ]+", consulta.lower())
                    if len(w) >= 5 and w not in _STOP]
        palabras = sorted(set(palabras), key=len, reverse=True)[:4] or [consulta]

        vistos: dict[str, dict] = {}
        for w in palabras:
            try:
                r = self.collection.get(
                    where=filtro or None,
                    where_document={"$contains": w},
                    limit=n_results,
                    include=["documents", "metadatas"],
                )
            except Exception:  # noqa: BLE001
                continue
            for item in self._fmt_get(r, modo=f"keyword:{w}"):
                key = f"{item['metadato'].get('pdf_id')}|{item['metadato'].get('section')}"
                vistos.setdefault(key, item)
            if len(vistos) >= n_results:
                break
        return list(vistos.values())[:n_results]

    # ------------------------------------------------------------------ #
    @staticmethod
    def _fmt_query(res, modo):
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        out = []
        for i, texto in enumerate(docs):
            out.append({
                "texto": texto,
                "metadato": metas[i] if i < len(metas) else {},
                "distancia": dists[i] if i < len(dists) else None,
                "modo": modo,
            })
        return out

    @staticmethod
    def _fmt_get(res, modo):
        docs = res.get("documents") or []
        metas = res.get("metadatas") or []
        out = []
        for i, texto in enumerate(docs):
            out.append({
                "texto": texto,
                "metadato": metas[i] if i < len(metas) else {},
                "distancia": None,
                "modo": modo,
            })
        return out

    def count(self) -> int:
        return self.collection.count()
