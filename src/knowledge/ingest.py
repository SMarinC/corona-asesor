"""Utilidades de datos.

La base de conocimiento la construye el equipo de datos y se entrega YA HECHA:
    data/processed/corona.duckdb   (tabla `products`, 505 filas)
    data/processed/chroma/         (colección `corona_fichas`, embeddings VoyageAI)

Por eso el flujo normal NO requiere ingesta: basta con dejar esos artefactos en
`data/processed/`. Este módulo ofrece:
    - `verificar()`  -> comprueba que la base y el índice existen y responden.
    - `ingest_products_json()` -> (opcional) recarga la tabla `products` desde un
      `data/raw/products.json`, por si algún día hay que regenerar el DuckDB.

Nota: reconstruir Chroma requiere las mismas herramientas y `VOYAGE_API_KEY` que
usó el equipo de datos; eso vive en su pipeline, no aquí.
"""
from __future__ import annotations

from pathlib import Path

import duckdb

from src import config


def verificar() -> dict:
    """Reporta el estado de las fuentes de conocimiento."""
    estado = {"duckdb_ok": False, "n_products": 0, "chroma_ok": False, "n_fragmentos": 0}
    db = Path(config.DUCKDB_PATH)
    if db.exists():
        try:
            con = duckdb.connect(str(db), read_only=True)
            tabs = {r[0] for r in con.execute("SHOW TABLES").fetchall()}
            if "products" in tabs:
                estado["n_products"] = con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
                estado["duckdb_ok"] = True
            con.close()
        except Exception as e:  # noqa: BLE001
            print(f"[!] DuckDB no responde: {e}")
    else:
        print(f"[!] No existe {db}. Copia la base construida a data/processed/.")

    try:
        from src.knowledge.chroma_store import ChromaStore
        cs = ChromaStore()
        estado["n_fragmentos"] = cs.count()
        estado["chroma_ok"] = estado["n_fragmentos"] > 0
    except Exception as e:  # noqa: BLE001
        print(f"[!] Chroma no responde: {e}")

    print(f"DuckDB: {'OK' if estado['duckdb_ok'] else 'FALTA'} · products={estado['n_products']}")
    print(f"Chroma: {'OK' if estado['chroma_ok'] else 'FALTA'} · fragmentos={estado['n_fragmentos']}")
    return estado


def ingest_products_json(raw_dir: Path | None = None, db_path: Path | None = None) -> int:
    """(Opcional) Recarga la tabla `products` desde data/raw/products.json."""
    raw_dir = Path(raw_dir or config.DATA_RAW_DIR)
    db_path = Path(db_path or config.DUCKDB_PATH)
    ruta = raw_dir / "products.json"
    if not ruta.exists():
        print(f"[!] No hay {ruta}; nada que recargar.")
        return 0
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(db_path), read_only=False)
    try:
        con.execute(
            "CREATE OR REPLACE TABLE products AS "
            "SELECT * FROM read_json_auto(?, format='array', maximum_object_size=50000000)",
            [str(ruta)],
        )
        n = con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        print(f"[ok] products: {n} filas recargadas desde products.json")
        return n
    finally:
        con.close()
