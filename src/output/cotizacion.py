"""Generación de cotizaciones en PDF (fpdf2).

Produce un PDF descargable con el desglose de la propuesta: productos,
cantidades, precios, total y validación de presupuesto. Opcionalmente incluye el
link de cada producto.

Usa las fuentes core de fpdf2 (latin-1); `_s()` sanea cualquier carácter fuera
de ese rango (p. ej. ™) para que nunca falle por un nombre de producto.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from pathlib import Path as _Path

from fpdf import FPDF

from src import config

# Paleta (azul Corona, tomado del logo: #035CB6)
_AZUL = (3, 92, 182)       # encabezado / acentos
_AZUL_CLARO = (226, 237, 250)
_GRIS = (90, 90, 90)
_NEGRO = (33, 33, 33)


_REEMPLAZOS = {
    "™": "(TM)", "→": "->", "²": "2", "³": "3", "•": "-", "–": "-", "—": "-",
    "“": '"', "”": '"', "‘": "'", "’": "'", "✓": "-", "…": "...",
}

_CONTACTO_FALLBACK = ("Corona Colombia  |  Linea nacional 018000 512 030  |  "
                      "WhatsApp +57 310 274 2006  |  corona.co")


def _contacto_footer() -> str:
    """Línea de contacto del pie de página, tomada de contexto_agente.json —
    la misma fuente que usa el agente — para no mantener estos datos
    duplicados (y potencialmente desactualizados) en dos archivos."""
    try:
        contacto = config.cargar_contexto_institucional().get("info_general", {}).get("contacto", {})
        linea = contacto.get("linea_nacional")
        whatsapp = contacto.get("whatsapp")
        if linea and whatsapp:
            return f"Corona Colombia  |  Linea nacional {linea}  |  WhatsApp {whatsapp}  |  corona.co"
    except Exception:  # noqa: BLE001 — el PDF nunca debe fallar por esto
        pass
    return _CONTACTO_FALLBACK


# Se resuelve una sola vez al cargar el módulo (mismo criterio que SYSTEM_PROMPT).
_CONTACTO_FOOTER = _contacto_footer()


def _s(text: Any) -> str:
    """Convierte a str seguro para las fuentes core de fpdf2 (latin-1),
    mapeando caracteres comunes fuera de latin-1 a equivalentes legibles."""
    s = str(text if text is not None else "")
    for a, b in _REEMPLAZOS.items():
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


def _cop(v: Any) -> str:
    try:
        return f"$ {float(v):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return "-"


def _dibujar_corona(pdf: FPDF, px: float, py: float, w: float = 13, h: float = 8.5):
    """Dibuja un escudo/corona blanco como marcador (si no hay logo oficial)."""
    pts = [
        (px, py + h), (px, py + 0.42 * h),
        (px + 0.16 * w, py), (px + 0.32 * w, py + 0.5 * h),
        (px + 0.50 * w, py), (px + 0.68 * w, py + 0.5 * h),
        (px + 0.84 * w, py), (px + w, py + 0.42 * h),
        (px + w, py + h),
    ]
    pdf.set_fill_color(255, 255, 255)
    try:
        pdf.polygon(pts, style="F")
    except Exception:  # noqa: BLE001 — si la firma difiere, no romper el PDF
        pdf.rect(px, py, w, h, "F")


class _PDF(FPDF):
    def header(self):
        self.set_fill_color(*_AZUL)
        self.rect(0, 0, self.w, 22, "F")
        logo = _Path(config.LOGO_PATH)
        x_titulo = 12
        if logo.exists():
            try:
                self.image(str(logo), x=12, y=6, h=10)  # logo azul, se funde con el header
                x_titulo = 12 + 52  # ancho aprox del logo + margen
            except Exception:  # noqa: BLE001
                _dibujar_corona(self, 12, 7); x_titulo = 30
        else:
            _dibujar_corona(self, 12, 7)
            x_titulo = 30
        self.set_xy(x_titulo, 6)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 15)
        self.cell(0, 10, _s("Asesor  -  Cotizacion"), align="L")
        self.ln(18)

    def footer(self):
        self.set_y(-16)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*_GRIS)
        self.cell(0, 5, _s(_CONTACTO_FOOTER), align="C")
        self.ln(4)
        self.cell(0, 5, _s(f"Pagina {self.page_no()}"), align="C")


def generar_cotizacion_pdf(
    items: list[dict[str, Any]],
    total: float | None = None,
    presupuesto: float | None = None,
    dentro_presupuesto: bool | None = None,
    cliente: str | None = None,
    proyecto: str | None = None,
    incluir_links: bool = False,
    notas: str | None = None,
    salida_dir: Path | str | None = None,
) -> str:
    """Genera el PDF y devuelve la ruta del archivo creado."""
    salida = Path(salida_dir or config.COTIZACIONES_DIR)
    salida.mkdir(parents=True, exist_ok=True)

    pdf = _PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # --- Metadatos ---
    pdf.set_text_color(*_GRIS)
    pdf.set_font("Helvetica", "", 9)
    fecha = datetime.now().strftime("%Y-%m-%d %H:%M")
    pdf.cell(0, 5, _s(f"Fecha: {fecha}"), ln=1)
    if cliente:
        pdf.cell(0, 5, _s(f"Cliente: {cliente}"), ln=1)
    if proyecto:
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _s(f"Proyecto: {proyecto}"))
    pdf.ln(3)

    # --- Encabezado de tabla ---
    links_col = bool(incluir_links)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*_AZUL)
    pdf.set_text_color(255, 255, 255)
    if links_col:
        w = [72, 18, 30, 32, 28]  # concepto, cant, unit, subtotal, (link va aparte)
    else:
        w = [92, 20, 34, 34]
    headers = (["Concepto", "Cant.", "Precio unit.", "Subtotal"])
    for i, h in enumerate(headers):
        pdf.cell(w[i], 8, _s(h), border=0, align="L" if i == 0 else "R", fill=True)
    pdf.ln(8)

    # --- Filas ---
    pdf.set_text_color(*_NEGRO)
    total_calc = 0.0
    fill = False
    for it in items:
        concepto = it.get("concepto", "")
        cant = it.get("cantidad", "")
        unit = it.get("precio_unitario")
        sub = it.get("subtotal")
        if sub is None and unit is not None:
            try:
                sub = float(cant) * float(unit)
            except (TypeError, ValueError):
                sub = None
        if sub is not None:
            total_calc += float(sub)

        pdf.set_font("Helvetica", "", 9)
        pdf.set_fill_color(*_AZUL_CLARO)
        pdf.cell(w[0], 7, _s(concepto)[:60], border="B", align="L", fill=fill)
        pdf.cell(w[1], 7, _s(cant), border="B", align="R", fill=fill)
        pdf.cell(w[2], 7, _s(_cop(unit)), border="B", align="R", fill=fill)
        pdf.cell(w[3], 7, _s(_cop(sub)), border="B", align="R", fill=fill)
        pdf.ln(7)
        if links_col and it.get("url"):
            pdf.set_font("Helvetica", "I", 7.5)
            pdf.set_text_color(*_GRIS)
            pdf.cell(8, 5, "", border=0)
            pdf.cell(0, 5, _s(it.get("url")), ln=1, link=it.get("url"))
            pdf.set_text_color(*_NEGRO)
        fill = not fill

    # --- Total ---
    total_final = total if total is not None else round(total_calc, 2)
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*_AZUL)
    ancho_izq = sum(w[:-1]) if not links_col else sum(w[:3])
    pdf.cell(ancho_izq, 9, _s("TOTAL"), align="R")
    pdf.cell(w[-1] if not links_col else w[3], 9, _s(_cop(total_final)), align="R", ln=1)

    # --- Presupuesto ---
    if presupuesto is not None:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_NEGRO)
        dentro = dentro_presupuesto
        if dentro is None:
            dentro = total_final <= presupuesto
        estado = "DENTRO del presupuesto" if dentro else "EXCEDE el presupuesto"
        dif = abs(presupuesto - total_final)
        pdf.ln(1)
        pdf.multi_cell(0, 5, _s(
            f"Presupuesto declarado: {_cop(presupuesto)}  |  {estado} por {_cop(dif)}."
        ))

    # --- Notas / disclaimer ---
    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*_GRIS)
    disclaimer = (notas or
                  "Cotizacion estimada generada por Corona Asesor. Precios y "
                  "disponibilidad sujetos a confirmacion. Las cantidades marcadas "
                  "'requiere revision' deben validarse con la ficha tecnica.")
    pdf.multi_cell(0, 4.5, _s(disclaimer))

    # --- Guardar ---
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    ruta = salida / f"cotizacion_{stamp}.pdf"
    pdf.output(str(ruta))
    return str(ruta)
