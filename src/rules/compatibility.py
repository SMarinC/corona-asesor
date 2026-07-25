"""Motor de reglas de compatibilidad.

Determina si una combinación (revestimiento + pegante + boquilla) es válida para
las condiciones del proyecto (interior/exterior, humedad, tráfico, formato, junta).

Estados posibles (según el brief):
    - COMPATIBLE
    - INCOMPATIBLE
    - REQUIERE_REVISION   (falta información técnica para decidir)

El estado global es el "peor" de todas las verificaciones individuales:
    INCOMPATIBLE  >  REQUIERE_REVISION  >  COMPATIBLE

El motor NO inventa: si falta un dato para verificar una regla, esa regla
devuelve REQUIERE_REVISION en lugar de asumir que pasa.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any


class Estado(str, Enum):
    COMPATIBLE = "Compatible"
    INCOMPATIBLE = "Incompatible"
    REQUIERE_REVISION = "Requiere revisión"


# Orden de severidad para combinar veredictos
_SEVERIDAD = {Estado.COMPATIBLE: 0, Estado.REQUIERE_REVISION: 1, Estado.INCOMPATIBLE: 2}


@dataclass
class Verificacion:
    regla: str
    estado: Estado
    mensaje: str

    def dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["estado"] = self.estado.value
        return d


@dataclass
class Veredicto:
    estado: Estado
    verificaciones: list[Verificacion] = field(default_factory=list)

    def dict(self) -> dict[str, Any]:
        return {
            "estado": self.estado.value,
            "verificaciones": [v.dict() for v in self.verificaciones],
        }


@dataclass
class ProyectoSpec:
    """Condiciones del proyecto declaradas por el usuario."""
    ambiente: str = "interior"          # "interior" | "exterior"
    zona_humeda: bool = False           # baño, cocina, exterior lluvia…
    trafico: str = "medio"              # "bajo" | "medio" | "alto"
    ancho_junta_mm: float | None = None


def _peor(estados: list[Estado]) -> Estado:
    return max(estados, key=lambda e: _SEVERIDAD[e]) if estados else Estado.COMPATIBLE


def _get(d: dict, *keys):
    """Devuelve el primer valor no nulo entre varias claves alternativas."""
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


# ----------------------------------------------------------------------------- #
#  Reglas individuales
# ----------------------------------------------------------------------------- #
def _regla_ambiente(revestimiento: dict, proy: ProyectoSpec) -> Verificacion:
    if proy.ambiente == "exterior":
        uso_ext = _get(revestimiento, "uso_exterior")
        if uso_ext is None:
            return Verificacion("Ambiente exterior", Estado.REQUIERE_REVISION,
                                "El producto no declara aptitud para exterior.")
        if not uso_ext:
            return Verificacion("Ambiente exterior", Estado.INCOMPATIBLE,
                                "El producto no es apto para uso exterior.")
        return Verificacion("Ambiente exterior", Estado.COMPATIBLE,
                            "Apto para exterior.")
    # interior
    uso_int = _get(revestimiento, "uso_interior")
    if uso_int is None:
        return Verificacion("Ambiente interior", Estado.REQUIERE_REVISION,
                            "El producto no declara aptitud para interior.")
    if not uso_int:
        return Verificacion("Ambiente interior", Estado.INCOMPATIBLE,
                            "El producto no es apto para uso interior.")
    return Verificacion("Ambiente interior", Estado.COMPATIBLE, "Apto para interior.")


def _regla_humedad(revestimiento: dict, proy: ProyectoSpec) -> Verificacion:
    if not proy.zona_humeda:
        return Verificacion("Humedad", Estado.COMPATIBLE, "Proyecto sin exigencia de humedad.")
    resistencia = _get(revestimiento, "resistencia_humedad")
    if resistencia is None:
        return Verificacion("Humedad", Estado.REQUIERE_REVISION,
                            "No hay dato de resistencia a la humedad.")
    if str(resistencia).lower() in ("alta", "media"):
        return Verificacion("Humedad", Estado.COMPATIBLE,
                            f"Resistencia a la humedad: {resistencia}.")
    return Verificacion("Humedad", Estado.INCOMPATIBLE,
                        f"Resistencia a la humedad insuficiente ({resistencia}) para zona húmeda.")


def _regla_trafico(revestimiento: dict, proy: ProyectoSpec) -> Verificacion:
    # Las paredes no reciben tránsito peatonal: la regla no aplica.
    if str(_get(revestimiento, "categoria") or "").lower() == "pared":
        return Verificacion("Tráfico", Estado.COMPATIBLE, "Revestimiento de pared: sin tránsito peatonal.")
    orden = {"bajo": 1, "medio": 2, "alto": 3}
    req = orden.get(str(proy.trafico).lower())
    cap = orden.get(str(_get(revestimiento, "trafico") or "").lower())
    if req is None or cap is None:
        return Verificacion("Tráfico", Estado.REQUIERE_REVISION,
                            "Falta el nivel de tráfico del proyecto o del producto.")
    if cap >= req:
        return Verificacion("Tráfico", Estado.COMPATIBLE,
                            f"Soporta tráfico {proy.trafico} (producto: {_get(revestimiento, 'trafico')}).")
    return Verificacion("Tráfico", Estado.INCOMPATIBLE,
                        f"El producto (tráfico {_get(revestimiento, 'trafico')}) no soporta tráfico {proy.trafico}.")


def _regla_pegante_revestimiento(revestimiento: dict, pegante: dict) -> Verificacion:
    tipos_ok = _get(pegante, "tipos_revestimiento_compatibles")  # lista derivada
    if not tipos_ok:
        return Verificacion("Pegante ↔ revestimiento", Estado.REQUIERE_REVISION,
                            "El pegante no declara material compatible en el catálogo; "
                            "confirmar en la ficha técnica.")
    tipos_ok_lc = {str(t).lower() for t in tipos_ok}
    # Material del revestimiento (p. ej. 'Cerámica', 'Porcelánico').
    materiales = _get(revestimiento, "materiales") or []
    mats_lc = {str(m).lower() for m in materiales}
    if not mats_lc:
        return Verificacion("Pegante ↔ revestimiento", Estado.REQUIERE_REVISION,
                            "El revestimiento no declara material; confirmar en la ficha técnica.")
    # ¿algún material del revestimiento aparece entre los compatibles del pegante?
    for m in mats_lc:
        if any(m in t or t in m for t in tipos_ok_lc):
            return Verificacion("Pegante ↔ revestimiento", Estado.COMPATIBLE,
                                f"Pegante compatible con material {', '.join(materiales)}.")
    return Verificacion("Pegante ↔ revestimiento", Estado.INCOMPATIBLE,
                        f"Pegante no recomendado para material {', '.join(materiales)}.")


def _regla_boquilla_junta(boquilla: dict, proy: ProyectoSpec) -> Verificacion:
    if proy.ancho_junta_mm is None:
        return Verificacion("Boquilla ↔ junta", Estado.REQUIERE_REVISION,
                            "No se especificó el ancho de junta del proyecto.")
    jmin = _get(boquilla, "junta_min_mm")
    jmax = _get(boquilla, "junta_max_mm")
    if jmin is None or jmax is None:
        return Verificacion("Boquilla ↔ junta", Estado.REQUIERE_REVISION,
                            "La boquilla no declara su rango de junta.")
    if jmin <= proy.ancho_junta_mm <= jmax:
        return Verificacion("Boquilla ↔ junta", Estado.COMPATIBLE,
                            f"Junta {proy.ancho_junta_mm} mm dentro del rango {jmin}–{jmax} mm.")
    return Verificacion("Boquilla ↔ junta", Estado.INCOMPATIBLE,
                        f"Junta {proy.ancho_junta_mm} mm fuera del rango {jmin}–{jmax} mm de la boquilla.")


def _regla_disponibilidad(nombre: str, producto: dict) -> Verificacion:
    disp = _get(producto, "disponibilidad")
    if disp is None:
        return Verificacion(f"Disponibilidad {nombre}", Estado.REQUIERE_REVISION,
                            f"Sin dato de disponibilidad para {nombre}.")
    if not disp:
        return Verificacion(f"Disponibilidad {nombre}", Estado.INCOMPATIBLE,
                            f"{nombre} sin disponibilidad.")
    return Verificacion(f"Disponibilidad {nombre}", Estado.COMPATIBLE, f"{nombre} disponible.")


# ----------------------------------------------------------------------------- #
#  Evaluación completa
# ----------------------------------------------------------------------------- #
def evaluar_combinacion(
    revestimiento: dict,
    proyecto: ProyectoSpec,
    pegante: dict | None = None,
    boquilla: dict | None = None,
) -> Veredicto:
    """Evalúa todas las reglas aplicables y devuelve un veredicto global.

    `revestimiento` es obligatorio; `pegante` y `boquilla` son opcionales
    (se verifican solo si se pasan).
    """
    checks: list[Verificacion] = [
        _regla_ambiente(revestimiento, proyecto),
        _regla_humedad(revestimiento, proyecto),
        _regla_trafico(revestimiento, proyecto),
        _regla_disponibilidad("revestimiento", revestimiento),
    ]
    if pegante is not None:
        checks.append(_regla_pegante_revestimiento(revestimiento, pegante))
        checks.append(_regla_disponibilidad("pegante", pegante))
    if boquilla is not None:
        checks.append(_regla_boquilla_junta(boquilla, proyecto))
        checks.append(_regla_disponibilidad("boquilla", boquilla))

    estado_global = _peor([c.estado for c in checks])
    return Veredicto(estado=estado_global, verificaciones=checks)
