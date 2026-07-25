"""Interfaz de demostración (Streamlit) del Agente Corona.

Ejecutar desde la raíz del repo:
    streamlit run app.py

Muestra:
    - Chat con el agente orquestador (responde también preguntas generales de
      Corona y muestra imágenes/links de producto).
    - Panel lateral con el estado de las fuentes de conocimiento.
    - La traza de herramientas de cada respuesta (observabilidad).
    - Botón para descargar la cotización en PDF cuando el agente la genera.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st

from src import config

st.set_page_config(page_title="Corona Asesor · Agente", page_icon="🧱", layout="wide")


@st.cache_resource(show_spinner="Iniciando agente…")
def get_agent():
    from src.agent.orchestrator import CoronaAgent
    return CoronaAgent()


def data_status() -> dict:
    estado = {"duckdb": False, "n": 0, "chroma": 0}
    try:
        from src.knowledge.duckdb_store import DuckDBStore
        with DuckDBStore(read_only=True) as d:
            if "products" in d._tables():
                estado["n"] = d.con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
                estado["duckdb"] = True
    except Exception:
        pass
    try:
        from src.knowledge.chroma_store import ChromaStore
        estado["chroma"] = ChromaStore().count()
    except Exception:
        pass
    return estado


def render_trace(trace: list[dict], key: str):
    """Muestra la traza de herramientas y botones de descarga de PDFs."""
    if not trace:
        return
    with st.expander(f"🔧 Herramientas usadas ({len(trace)})"):
        for paso in trace:
            st.markdown(f"**{paso['tool']}**")
            st.code(json.dumps(paso["input"], ensure_ascii=False, indent=2), language="json")
            st.code(json.dumps(paso["output"], ensure_ascii=False, indent=2, default=str), language="json")
    # Botones de descarga para cotizaciones PDF generadas
    for j, paso in enumerate(trace):
        out = paso.get("output") or {}
        if paso.get("tool") == "generar_cotizacion_pdf" and isinstance(out, dict) and out.get("archivo"):
            ruta = Path(out["archivo"])
            if ruta.exists():
                with open(ruta, "rb") as f:
                    st.download_button(
                        "📄 Descargar cotización (PDF)",
                        data=f.read(),
                        file_name=ruta.name,
                        mime="application/pdf",
                        key=f"dl-{key}-{j}",
                    )


# --------------------------------------------------------------------------- #
#  Barra lateral
# --------------------------------------------------------------------------- #
with st.sidebar:
    st.header("🧱 Corona Asesor")
    st.caption("Agente para pisos, paredes, pegantes y boquillas — y consultas generales de Corona.")

    st.subheader("Fuentes de conocimiento")
    estado = data_status()
    if estado["duckdb"]:
        st.success(f"DuckDB · {estado['n']} productos")
    else:
        st.warning("DuckDB no disponible. Revisa data/processed/corona.duckdb")
    if estado["chroma"]:
        st.success(f"Chroma · {estado['chroma']} fragmentos de fichas")
    else:
        st.warning("Chroma no disponible. Revisa data/processed/chroma/")

    if not config.ANTHROPIC_API_KEY:
        st.error("Falta ANTHROPIC_API_KEY en el .env")
    if not config.VOYAGE_API_KEY:
        st.info("Sin VOYAGE_API_KEY: la evidencia usa fallback por palabra clave.")

    st.divider()
    if st.button("🔄 Reiniciar conversación"):
        if "agent" in st.session_state:
            del st.session_state["agent"]
        get_agent.clear()
        st.session_state.mensajes = []
        st.rerun()

    with st.expander("Ejemplos de consulta"):
        st.markdown(
            "- Piso para una cocina de 4×3 m, diseño claro, fácil de limpiar, "
            "presupuesto 2.500.000 COP.\n"
            "- ¿Qué garantía tienen los pisos Corona?\n"
            "- ¿Dónde queda la tienda Corona más cercana?\n"
            "- ¿Venden sanitarios?"
        )


# --------------------------------------------------------------------------- #
#  Chat
# --------------------------------------------------------------------------- #
st.title("Corona Asesor")

if "mensajes" not in st.session_state:
    st.session_state.mensajes = []

for idx, m in enumerate(st.session_state.mensajes):
    with st.chat_message(m["role"]):
        st.markdown(m["contenido"])
        if m.get("trace"):
            render_trace(m["trace"], key=f"hist-{idx}")

prompt = st.chat_input("Describe tu proyecto o pregunta lo que quieras de Corona…")
if prompt:
    st.session_state.mensajes.append({"role": "user", "contenido": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        try:
            agente = get_agent()
            with st.spinner("El agente está trabajando…"):
                resultado = agente.ask(prompt)
            st.markdown(resultado["texto"])
            render_trace(resultado["trace"], key=f"live-{len(st.session_state.mensajes)}")
            st.session_state.mensajes.append({
                "role": "assistant",
                "contenido": resultado["texto"],
                "trace": resultado["trace"],
            })
        except Exception as e:
            st.error(f"Error: {e}")
