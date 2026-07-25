"""Verifica la base de conocimiento (o recarga products.json si se pide).

    python run_ingest.py              # verifica DuckDB + Chroma
    python run_ingest.py --reload     # recarga tabla products desde data/raw/products.json
"""
import sys

from src.knowledge import ingest

if __name__ == "__main__":
    if "--reload" in sys.argv[1:]:
        ingest.ingest_products_json()
    ingest.verificar()
