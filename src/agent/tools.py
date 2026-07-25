"""Definición de herramientas (tool use) y su ejecución real.

- `ANTHROPIC_TOOLS`: esquema JSON de cada herramienta, tal como lo espera la API
  de Anthropic (name, description, input_schema).
- `ToolDispatcher`: ejecuta la herramienta REAL (DuckDB, Chroma, cálculos,
  reglas). No hay mocks: cada llamada consulta datos o computa deterministamente.
"""
from __future__ import annotations

from typing import Any, TYPE_CHECKING

from src.calc import calculations as calc
from src.rules.compatibility import ProyectoSpec, evaluar_combinacion

if TYPE_CHECKING:  # solo para type hints; evita exigir duckdb/chromadb en runtime
    from src.knowledge.duckdb_store import DuckDBStore
    from src.knowledge.chroma_store import ChromaStore


# --------------------------------------------------------------------------- #
#  Esquema de herramientas para el LLM
# --------------------------------------------------------------------------- #
ANTHROPIC_TOOLS: list[dict[str, Any]] = [
    {
        "name": "calcular_area",
        "description": "Calcula el área de un espacio rectangular y le suma un porcentaje de desperdicio. Úsala apenas conozcas largo y ancho.",
        "input_schema": {
            "type": "object",
            "properties": {
                "largo_m": {"type": "number", "description": "Largo del espacio en metros."},
                "ancho_m": {"type": "number", "description": "Ancho del espacio en metros."},
                "desperdicio_pct": {"type": "number", "description": "Fracción de desperdicio (0.10 = 10%). Opcional."},
            },
            "required": ["largo_m", "ancho_m"],
        },
    },
    {
        "name": "buscar_revestimientos",
        "description": "Busca pisos o paredes (revestimientos) reales del catálogo. Filtros: categoría (piso/pared), ambiente (interior/exterior, derivado de las áreas de uso), acabado (Mate/Brillante/Semibrillante/Satinado), diseño (Marmolizado/Maderas/Naturales/…), color (busca en el nombre, p. ej. 'blanco'), zona húmeda y precio máximo. Nota: el catálogo NO trae m² por caja ni tráfico numérico; eso se consulta en las fichas con buscar_evidencia.",
        "input_schema": {
            "type": "object",
            "properties": {
                "categoria": {"type": "string", "enum": ["piso", "pared"]},
                "ambiente": {"type": "string", "enum": ["interior", "exterior"]},
                "acabado": {"type": "string", "description": "Mate, Brillante, Semibrillante, Satinado."},
                "diseno": {"type": "string", "description": "Marmolizado, Maderas, Naturales, Exteriores…"},
                "color": {"type": "string", "description": "Palabra a buscar en el nombre, p. ej. 'blanco', 'gris'."},
                "zona_humeda": {"type": "boolean", "description": "True si el espacio es húmedo (baño, cocina, exterior)."},
                "precio_max": {"type": "number", "description": "Precio máximo por caja en COP."},
                "limit": {"type": "integer", "description": "Máximo de resultados (por defecto 8)."},
            },
        },
    },
    {
        "name": "buscar_pegantes",
        "description": "Busca pegantes disponibles del catálogo. Opcional: filtrar por tipo/material objetivo (porcelanato, ceramica, gran formato).",
        "input_schema": {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "description": "porcelanato, ceramica o gran formato."},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "buscar_boquillas",
        "description": "Busca boquillas (grout) disponibles, opcionalmente filtrando por ancho de junta (mm) y ambiente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ancho_junta_mm": {"type": "number"},
                "ambiente": {"type": "string", "enum": ["interior", "exterior"]},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_producto",
        "description": "Obtiene y normaliza todos los datos de un producto por su SKU (sirve para revestimientos, pegantes o boquillas).",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {"type": "string"},
            },
            "required": ["sku"],
        },
    },
    {
        "name": "calcular_cajas",
        "description": "Calcula cuántas cajas de un revestimiento se necesitan para un área (ya con desperdicio). Usa los m² por caja reales del producto.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_revestimiento": {"type": "string"},
                "area_con_desperdicio_m2": {"type": "number"},
            },
            "required": ["sku_revestimiento", "area_con_desperdicio_m2"],
        },
    },
    {
        "name": "calcular_pegante",
        "description": "Calcula kilos y bultos de un pegante para un área, usando el rendimiento (kg/m²) real de su ficha técnica.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_pegante": {"type": "string"},
                "area_m2": {"type": "number", "description": "Área a pegar (con desperdicio)."},
            },
            "required": ["sku_pegante", "area_m2"],
        },
    },
    {
        "name": "calcular_boquilla",
        "description": "Calcula kilos y unidades de boquilla para un área, según formato y espesor del revestimiento y el ancho de junta.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_revestimiento": {"type": "string"},
                "sku_boquilla": {"type": "string"},
                "area_m2": {"type": "number"},
                "ancho_junta_mm": {"type": "number"},
            },
            "required": ["sku_revestimiento", "sku_boquilla", "area_m2", "ancho_junta_mm"],
        },
    },
    {
        "name": "validar_compatibilidad",
        "description": "Valida si una combinación (revestimiento + pegante + boquilla) cumple las condiciones del proyecto. Devuelve estado Compatible / Incompatible / Requiere revisión con razones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_revestimiento": {"type": "string"},
                "ambiente": {"type": "string", "enum": ["interior", "exterior"]},
                "zona_humeda": {"type": "boolean"},
                "trafico": {"type": "string", "enum": ["bajo", "medio", "alto"]},
                "ancho_junta_mm": {"type": "number"},
                "sku_pegante": {"type": "string"},
                "sku_boquilla": {"type": "string"},
            },
            "required": ["sku_revestimiento"],
        },
    },
    {
        "name": "calcular_presupuesto",
        "description": "Suma líneas de costo (revestimiento, pegante, boquilla) y valida contra el presupuesto del usuario.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lineas": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "concepto": {"type": "string"},
                            "cantidad": {"type": "number"},
                            "precio_unitario": {"type": "number"},
                        },
                        "required": ["concepto", "cantidad", "precio_unitario"],
                    },
                },
                "presupuesto": {"type": "number"},
            },
            "required": ["lineas"],
        },
    },
    {
        "name": "buscar_evidencia",
        "description": "Búsqueda semántica en las fichas técnicas (Chroma). Devuelve fragmentos que respaldan una recomendación o restricción. Úsala para justificar con evidencia y no inventar.",
        "input_schema": {
            "type": "object",
            "properties": {
                "consulta": {"type": "string"},
                "sku": {"type": "string", "description": "Opcional: acota la evidencia a un producto."},
                "n": {"type": "integer", "description": "Número de fragmentos (por defecto 4)."},
            },
            "required": ["consulta"],
        },
    },
]


# --------------------------------------------------------------------------- #
#  Utilidades
# --------------------------------------------------------------------------- #
def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
#  Ejecutor de herramientas
# --------------------------------------------------------------------------- #
class ToolDispatcher:
    def __init__(self, duck: DuckDBStore | None = None, chroma: ChromaStore | None = None,
                 desperdicio_defecto: float = 0.10):
        self.duck = duck
        self.chroma = chroma
        self.desperdicio_defecto = desperdicio_defecto

    def run(self, name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        """Enruta la llamada a la implementación real y devuelve un dict."""
        try:
            handler = getattr(self, f"_t_{name}", None)
            if handler is None:
                return {"error": f"Herramienta desconocida: {name}"}
            return handler(tool_input)
        except Exception as e:  # nunca romper el loop del agente por un error de tool
            return {"error": f"Error ejecutando {name}: {e}"}

    # -- cálculos ----------------------------------------------------------- #
    def _t_calcular_area(self, i):
        desp = i.get("desperdicio_pct", self.desperdicio_defecto)
        return calc.calcular_area(_num(i["largo_m"]), _num(i["ancho_m"]), _num(desp)).dict()

    def _t_calcular_cajas(self, i):
        prod = self._producto(i["sku_revestimiento"])
        if not prod:
            return {"error": f"Revestimiento {i['sku_revestimiento']} no existe en el catálogo."}
        r = calc.calcular_cajas(_num(i["area_con_desperdicio_m2"]), _num(prod.get("m2_por_caja"))).dict()
        if r["requiere_revision"]:
            r["nota"] = ("El catálogo no trae m² por caja de este producto. "
                         "Usa buscar_evidencia con su SKU para obtener el rendimiento de la ficha técnica.")
        precio = _num(prod.get("precio"))
        if precio and not r["requiere_revision"]:
            r["precio_caja"] = precio
            r["costo_revestimiento"] = round(r["cajas"] * precio, 2)
        elif precio:
            r["precio_caja"] = precio
        return r

    def _t_calcular_pegante(self, i):
        peg = self._producto(i["sku_pegante"])
        if not peg:
            return {"error": f"Pegante {i['sku_pegante']} no existe en el catálogo."}
        r = calc.calcular_pegante(
            _num(i["area_m2"]), _num(peg.get("rendimiento_kg_m2")), _num(peg.get("presentacion_kg"))
        ).dict()
        if r["requiere_revision"] and peg.get("rendimiento_texto"):
            r["rendimiento_texto"] = peg["rendimiento_texto"]
        precio = _num(peg.get("precio"))
        if precio and not r["requiere_revision"]:
            r["precio_bulto"] = precio
            r["costo_pegante"] = round(r["bultos"] * precio, 2)
        elif precio:
            r["precio_bulto"] = precio
        return r

    def _t_calcular_boquilla(self, i):
        rev = self._producto(i["sku_revestimiento"])
        boq = self._producto(i["sku_boquilla"])
        if not rev:
            return {"error": f"Revestimiento {i['sku_revestimiento']} no existe."}
        if not boq:
            return {"error": f"Boquilla {i['sku_boquilla']} no existe."}
        r = calc.calcular_boquilla(
            area_m2=_num(i["area_m2"]),
            baldosa_largo_mm=_num(rev.get("formato_largo_mm")),
            baldosa_ancho_mm=_num(rev.get("formato_ancho_mm")),
            espesor_baldosa_mm=_num(rev.get("espesor_mm")),
            ancho_junta_mm=_num(i["ancho_junta_mm"]),
            presentacion_kg=_num(boq.get("presentacion_kg")),
        ).dict()
        if r["requiere_revision"] and boq.get("rendimiento_texto"):
            r["rendimiento_texto"] = boq["rendimiento_texto"]
        precio = _num(boq.get("precio"))
        if precio and not r["requiere_revision"]:
            r["precio_unidad"] = precio
            r["costo_boquilla"] = round(r["unidades"] * precio, 2)
        elif precio:
            r["precio_unidad"] = precio
        return r

    def _t_calcular_presupuesto(self, i):
        lineas = [
            calc.LineaCosto(
                concepto=l["concepto"],
                cantidad=_num(l["cantidad"]),
                precio_unitario=_num(l["precio_unitario"]),
                subtotal=round(_num(l["cantidad"]) * _num(l["precio_unitario"]), 2),
            )
            for l in i["lineas"]
        ]
        return calc.calcular_presupuesto(lineas, _num(i.get("presupuesto"))).dict()

    # -- catálogo (DuckDB) -------------------------------------------------- #
    def _producto(self, sku):
        if not self.duck:
            return None
        return self.duck.get_producto(sku)

    def _t_get_producto(self, i):
        p = self._producto(i["sku"])
        return p or {"error": f"No se encontró el SKU {i['sku']} en el catálogo."}

    def _t_buscar_revestimientos(self, i):
        if not self.duck:
            return {"error": "Base de datos no disponible."}
        res = self.duck.buscar_revestimientos(
            categoria=i.get("categoria"), ambiente=i.get("ambiente"),
            acabado=i.get("acabado"), diseno=i.get("diseno"), color=i.get("color"),
            zona_humeda=i.get("zona_humeda"),
            precio_max=_num(i.get("precio_max")) if i.get("precio_max") is not None else None,
            limit=int(i.get("limit", 8)),
        )
        return {"resultados": res, "n": len(res)}

    def _t_buscar_pegantes(self, i):
        if not self.duck:
            return {"error": "Base de datos no disponible."}
        res = self.duck.buscar_pegantes(tipo=i.get("tipo"), limit=int(i.get("limit", 8)))
        return {"resultados": res, "n": len(res)}

    def _t_buscar_boquillas(self, i):
        if not self.duck:
            return {"error": "Base de datos no disponible."}
        res = self.duck.buscar_boquillas(
            ancho_junta_mm=_num(i.get("ancho_junta_mm")) if i.get("ancho_junta_mm") is not None else None,
            limit=int(i.get("limit", 8)),
        )
        return {"resultados": res, "n": len(res)}

    # -- reglas ------------------------------------------------------------- #
    def _t_validar_compatibilidad(self, i):
        rev = self._producto(i["sku_revestimiento"])
        if not rev:
            return {"error": f"Revestimiento {i['sku_revestimiento']} no existe."}
        peg = self._producto(i["sku_pegante"]) if i.get("sku_pegante") else None
        boq = self._producto(i["sku_boquilla"]) if i.get("sku_boquilla") else None
        proy = ProyectoSpec(
            ambiente=i.get("ambiente", "interior"),
            zona_humeda=bool(i.get("zona_humeda", False)),
            trafico=i.get("trafico", "medio"),
            ancho_junta_mm=_num(i.get("ancho_junta_mm")) if i.get("ancho_junta_mm") is not None else None,
        )
        return evaluar_combinacion(rev, proy, peg, boq).dict()

    # -- evidencia (Chroma) ------------------------------------------------- #
    def _t_buscar_evidencia(self, i):
        if not self.chroma:
            return {"error": "Índice de fichas técnicas no disponible."}
        filtro = {"sku": i["sku"]} if i.get("sku") else None
        frags = self.chroma.buscar(i["consulta"], n_results=int(i.get("n", 4)), filtro=filtro)
        return {"fragmentos": frags, "n": len(frags)}
