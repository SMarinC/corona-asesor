"""Interfaz de demostración (Streamlit) del Agente Corona.

Ejecutar desde la raíz del repo:
    streamlit run app.py

Muestra:
    - Chat con el agente orquestador (responde también preguntas generales de
      Corona y muestra imágenes/links de producto).
    - Panel lateral con las baldosas (pisos/paredes) que más concuerdan,
      tomadas de las búsquedas reales que hace el agente en el catálogo.
    - La traza de herramientas de cada respuesta (observabilidad).
    - Botón para descargar la cotización en PDF cuando el agente la genera.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st

st.set_page_config(page_title="Corona Asesor · Agente", page_icon="🧱", layout="wide")

# --------------------------------------------------------------------------- #
#  Hero: marca
# --------------------------------------------------------------------------- #
logo_path = os.path.join(os.path.dirname(__file__), "assets", "logo.png")

col_izq, col_centro, col_der = st.columns([3, 1, 3])
with col_centro:
    if os.path.exists(logo_path):
        st.image(logo_path, use_container_width=True)

st.markdown(
    """
    <p style="text-align:center; font-size:1.05rem; line-height:1.55; margin-top:0.5rem;">
    Corona es una marca colombiana con más de un siglo de trayectoria en el sector de la
    construcción y el hogar, reconocida por sus pisos, revestimientos, sanitarios, grifería,
    pinturas y demás materiales para construir y remodelar espacios.
    </p>
    <p style="text-align:center; font-size:0.95rem; color:#555; margin-top:-0.3rem;">
    Este asistente virtual se especializa en <strong>cotizaciones para renovaciones de
    pisos</strong>: te ayuda a estimar productos, cantidades y presupuesto en minutos.
    </p>
    """,
    unsafe_allow_html=True,
)

st.divider()


@st.cache_resource(show_spinner="Iniciando agente…")
def get_agent():
    from src.agent.orchestrator import CoronaAgent
    return CoronaAgent()


def extraer_candidatos(trace: list[dict]) -> list[dict]:
    """Junta los productos (pisos/paredes) devueltos por buscar_revestimientos
    en esta traza, sin duplicar por SKU."""
    candidatos: dict[str, dict] = {}
    for paso in trace:
        if paso.get("tool") != "buscar_revestimientos":
            continue
        salida = paso.get("output") or {}
        for prod in salida.get("resultados", []) or []:
            sku = prod.get("sku")
            if sku and sku not in candidatos:
                candidatos[sku] = prod
    return list(candidatos.values())


def render_candidatos(candidatos: list[dict]):
    """Panel lateral con las baldosas que más concuerdan con la búsqueda."""
    st.markdown("#### 🧱 Baldosas que más concuerdan")
    if not candidatos:
        st.caption(
            "Aquí verás las opciones sugeridas apenas el agente busque "
            "pisos o paredes para tu cotización."
        )
        return
    for prod in candidatos[:6]:
        with st.container(border=True):
            col_img, col_txt = st.columns([1, 2], gap="small")
            with col_img:
                if prod.get("imagen"):
                    st.image(prod["imagen"], width=80)
            with col_txt:
                st.markdown(f"**{prod.get('nombre') or 'Producto'}**")
                precio = prod.get("precio")
                if precio:
                    st.caption(f"${precio:,.0f} COP")
                if prod.get("url"):
                    st.markdown(f"[Ver producto]({prod['url']})")


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
#  Chat (columna centrada) + panel de baldosas candidatas (columna lateral)
# --------------------------------------------------------------------------- #
if "mensajes" not in st.session_state:
    st.session_state.mensajes = []

col_chat, col_candidatos = st.columns([2, 1], gap="large")

with col_chat:
    st.title("Corona Asesor")

    if not st.session_state.mensajes:
        with st.chat_message("assistant"):
            st.write("Cuéntame cómo puedo ayudarte hoy")

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

# El panel lateral se llena DESPUÉS de procesar el prompt para que incluya,
# en el mismo turno, los candidatos que el agente acaba de buscar.
with col_candidatos:
    candidatos_actuales: list[dict] = []
    for m in reversed(st.session_state.mensajes):
        if m["role"] == "assistant" and m.get("trace"):
            candidatos_actuales = extraer_candidatos(m["trace"])
            if candidatos_actuales:
                break
    render_candidatos(candidatos_actuales)
