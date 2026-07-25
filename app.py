"""Interfaz de demostración (Streamlit) del Agente Corona.

Ejecutar desde la raíz del repo:
    streamlit run app.py

Muestra:
    - Chat con el agente orquestador.
    - Panel lateral con el estado de las fuentes de conocimiento.
    - La traza de herramientas de cada respuesta (observabilidad → no es una
      caja negra; se ve QUÉ consultó y calculó el agente para no alucinar).
"""
from __future__ import annotations

import json

import streamlit as st

from src import config

st.set_page_config(page_title="Corona Asesor · Agente", page_icon="🧱", layout="wide")


# --------------------------------------------------------------------------- #
#  Inicialización del agente (una vez por sesión)
# --------------------------------------------------------------------------- #
@st.cache_resource(show_spinner="Iniciando agente…")
def get_agent():
    from src.agent.orchestrator import CoronaAgent
    return CoronaAgent()


def data_status() -> dict:
    """Estado de las fuentes de datos para el panel lateral."""
    estado = {"duckdb": False, "tablas": {}, "chroma": 0}
    try:
        from src.knowledge.duckdb_store import DuckDBStore
        with DuckDBStore(read_only=True) as d:
            for t in ("revestimientos", "pegantes", "boquillas"):
                if t in d._tables():
                    n = d.con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                    estado["tablas"][t] = n
            estado["duckdb"] = bool(estado["tablas"])
    except Exception:
        pass
    try:
        from src.knowledge.chroma_store import ChromaStore
        estado["chroma"] = ChromaStore().count()
    except Exception:
        pass
    return estado


# --------------------------------------------------------------------------- #
#  Barra lateral
# --------------------------------------------------------------------------- #
with st.sidebar:
    st.header("🧱 Corona Asesor")
    st.caption("Agente para planear pisos, paredes, pegantes y boquillas.")

    st.subheader("Fuentes de conocimiento")
    estado = data_status()
    if estado["duckdb"]:
        for t, n in estado["tablas"].items():
            st.success(f"DuckDB · {t}: {n} productos")
    else:
        st.warning("DuckDB vacío. Corre `python run_ingest.py`.")
    if estado["chroma"]:
        st.success(f"Chroma · {estado['chroma']} fragmentos de fichas")
    else:
        st.warning("Chroma vacío. Corre `python run_ingest.py`.")

    if not config.ANTHROPIC_API_KEY:
        st.error("Falta ANTHROPIC_API_KEY en el .env")

    st.divider()
    if st.button("🔄 Reiniciar conversación"):
        if "agent" in st.session_state:
            st.session_state.agent.reset()
        st.session_state.mensajes = []
        st.rerun()

    with st.expander("Ejemplos de consulta"):
        st.markdown(
            "- Necesito cambiar el piso de una cocina de 4×3 m, diseño claro, "
            "fácil de limpiar, presupuesto 2.500.000 COP.\n"
            "- Quiero enchapar la pared de un baño de 2×2.5 m en zona húmeda.\n"
            "- Piso para una terraza exterior de 5×4 m con tráfico alto."
        )


# --------------------------------------------------------------------------- #
#  Chat
# --------------------------------------------------------------------------- #
st.title("Corona Asesor")

if "mensajes" not in st.session_state:
    st.session_state.mensajes = []

# Render del historial visible
for m in st.session_state.mensajes:
    with st.chat_message(m["role"]):
        st.markdown(m["contenido"])
        if m.get("trace"):
            with st.expander(f"🔧 Herramientas usadas ({len(m['trace'])})"):
                for paso in m["trace"]:
                    st.markdown(f"**{paso['tool']}**")
                    st.code(json.dumps(paso["input"], ensure_ascii=False, indent=2), language="json")
                    st.code(json.dumps(paso["output"], ensure_ascii=False, indent=2, default=str), language="json")

prompt = st.chat_input("Describe tu proyecto…")
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
            if resultado["trace"]:
                with st.expander(f"🔧 Herramientas usadas ({len(resultado['trace'])})"):
                    for paso in resultado["trace"]:
                        st.markdown(f"**{paso['tool']}**")
                        st.code(json.dumps(paso["input"], ensure_ascii=False, indent=2), language="json")
                        st.code(json.dumps(paso["output"], ensure_ascii=False, indent=2, default=str), language="json")
            st.session_state.mensajes.append({
                "role": "assistant",
                "contenido": resultado["texto"],
                "trace": resultado["trace"],
            })
        except Exception as e:
            st.error(f"Error: {e}")
