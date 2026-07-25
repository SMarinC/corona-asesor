"""Motor de cálculos deterministas.

Todas las funciones son puras y testeables: no llaman al LLM ni a la red.
Devuelven, además del número, el desglose del cálculo (`detalle`) para que el
agente pueda *explicar* el resultado con evidencia — clave para no alucinar.

Reglas de honestidad de datos:
- Si falta un dato necesario (p. ej. rendimiento del pegante), la función
  devuelve `requiere_revision=True` en vez de inventar un número.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from typing import Any


# ----------------------------------------------------------------------------- #
#  Área y desperdicio
# ----------------------------------------------------------------------------- #
@dataclass
class ResultadoArea:
    area_util_m2: float
    area_con_desperdicio_m2: float
    desperdicio_pct: float
    detalle: str

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def calcular_area(largo_m: float, ancho_m: float, desperdicio_pct: float = 0.10) -> ResultadoArea:
    """Área de un espacio rectangular más un margen de desperdicio.

    Args:
        largo_m: largo en metros.
        ancho_m: ancho en metros.
        desperdicio_pct: fracción de desperdicio (0.10 = 10%).
    """
    if largo_m <= 0 or ancho_m <= 0:
        raise ValueError("Largo y ancho deben ser mayores que cero.")
    if desperdicio_pct < 0:
        raise ValueError("El desperdicio no puede ser negativo.")

    area = largo_m * ancho_m
    area_desp = area * (1 + desperdicio_pct)
    return ResultadoArea(
        area_util_m2=round(area, 3),
        area_con_desperdicio_m2=round(area_desp, 3),
        desperdicio_pct=desperdicio_pct,
        detalle=(
            f"{largo_m} m × {ancho_m} m = {area:.2f} m². "
            f"Con {desperdicio_pct * 100:.0f}% de desperdicio = {area_desp:.2f} m²."
        ),
    )


# ----------------------------------------------------------------------------- #
#  Cajas de revestimiento
# ----------------------------------------------------------------------------- #
@dataclass
class ResultadoCajas:
    cajas: int
    m2_cubiertos: float
    requiere_revision: bool = False
    detalle: str = ""

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def calcular_cajas(area_con_desperdicio_m2: float, m2_por_caja: float | None) -> ResultadoCajas:
    """Número entero de cajas necesarias (siempre redondea hacia arriba)."""
    if not m2_por_caja or m2_por_caja <= 0:
        return ResultadoCajas(
            cajas=0,
            m2_cubiertos=0.0,
            requiere_revision=True,
            detalle="No hay dato de m² por caja para este producto → requiere revisión.",
        )
    cajas = math.ceil(area_con_desperdicio_m2 / m2_por_caja)
    cubiertos = cajas * m2_por_caja
    return ResultadoCajas(
        cajas=cajas,
        m2_cubiertos=round(cubiertos, 3),
        detalle=(
            f"{area_con_desperdicio_m2:.2f} m² ÷ {m2_por_caja} m²/caja "
            f"= {area_con_desperdicio_m2 / m2_por_caja:.2f} → {cajas} cajas "
            f"(cubren {cubiertos:.2f} m²)."
        ),
    )


# ----------------------------------------------------------------------------- #
#  Pegante
# ----------------------------------------------------------------------------- #
@dataclass
class ResultadoPegante:
    kg_necesarios: float
    bultos: int
    requiere_revision: bool = False
    detalle: str = ""

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def calcular_pegante(
    area_m2: float,
    rendimiento_kg_m2: float | None,
    presentacion_kg: float | None,
) -> ResultadoPegante:
    """Kilos de pegante y bultos según el rendimiento de la ficha técnica.

    `rendimiento_kg_m2` y `presentacion_kg` DEBEN venir de la ficha técnica real.
    Si faltan, se marca `requiere_revision` en vez de asumir un valor.
    """
    if not rendimiento_kg_m2 or rendimiento_kg_m2 <= 0 or not presentacion_kg or presentacion_kg <= 0:
        return ResultadoPegante(
            kg_necesarios=0.0,
            bultos=0,
            requiere_revision=True,
            detalle="Falta rendimiento o presentación del pegante en la ficha técnica → requiere revisión.",
        )
    kg = area_m2 * rendimiento_kg_m2
    bultos = math.ceil(kg / presentacion_kg)
    return ResultadoPegante(
        kg_necesarios=round(kg, 2),
        bultos=bultos,
        detalle=(
            f"{area_m2:.2f} m² × {rendimiento_kg_m2} kg/m² = {kg:.2f} kg. "
            f"÷ {presentacion_kg} kg/bulto → {bultos} bultos."
        ),
    )


# ----------------------------------------------------------------------------- #
#  Boquilla (grout)
# ----------------------------------------------------------------------------- #
@dataclass
class ResultadoBoquilla:
    kg_necesarios: float
    unidades: int
    requiere_revision: bool = False
    detalle: str = ""

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def calcular_boquilla(
    area_m2: float,
    baldosa_largo_mm: float | None,
    baldosa_ancho_mm: float | None,
    espesor_baldosa_mm: float | None,
    ancho_junta_mm: float | None,
    presentacion_kg: float | None,
    densidad_g_cm3: float = 1.6,
) -> ResultadoBoquilla:
    """Kilos de boquilla usando la fórmula estándar de consumo por junta.

        consumo (kg/m²) = ((L + A) / (L × A)) × junta × espesor × densidad

    donde L, A, espesor y junta van en milímetros y densidad en g/cm³
    (1.6 es un valor típico para boquilla cementicia; ajústese con la ficha).

    Es una estimación de ingeniería: si la ficha técnica trae un rendimiento
    tabulado, úsese ese en su lugar. Si faltan medidas, requiere revisión.
    """
    faltantes = [
        v is None or v <= 0
        for v in (baldosa_largo_mm, baldosa_ancho_mm, espesor_baldosa_mm, ancho_junta_mm, presentacion_kg)
    ]
    if any(faltantes):
        return ResultadoBoquilla(
            kg_necesarios=0.0,
            unidades=0,
            requiere_revision=True,
            detalle="Faltan medidas de baldosa/junta o presentación → requiere revisión.",
        )

    consumo_kg_m2 = (
        (baldosa_largo_mm + baldosa_ancho_mm) / (baldosa_largo_mm * baldosa_ancho_mm)
    ) * ancho_junta_mm * espesor_baldosa_mm * densidad_g_cm3

    kg = consumo_kg_m2 * area_m2
    unidades = math.ceil(kg / presentacion_kg)
    return ResultadoBoquilla(
        kg_necesarios=round(kg, 2),
        unidades=unidades,
        detalle=(
            f"Consumo estimado {consumo_kg_m2:.3f} kg/m² × {area_m2:.2f} m² = {kg:.2f} kg. "
            f"÷ {presentacion_kg} kg/unidad → {unidades} unidades. "
            f"(Fórmula estándar; validar con ficha técnica.)"
        ),
    )


# ----------------------------------------------------------------------------- #
#  Presupuesto
# ----------------------------------------------------------------------------- #
@dataclass
class LineaCosto:
    concepto: str
    cantidad: float
    precio_unitario: float
    subtotal: float


@dataclass
class ResultadoPresupuesto:
    costo_total: float
    dentro_presupuesto: bool
    diferencia: float
    lineas: list[LineaCosto] = field(default_factory=list)
    detalle: str = ""

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def calcular_presupuesto(lineas: list[LineaCosto], presupuesto: float | None) -> ResultadoPresupuesto:
    """Suma las líneas de costo y valida contra el presupuesto del usuario."""
    total = round(sum(l.subtotal for l in lineas), 2)
    if presupuesto is None:
        return ResultadoPresupuesto(
            costo_total=total,
            dentro_presupuesto=True,
            diferencia=0.0,
            lineas=lineas,
            detalle=f"Costo total estimado: ${total:,.0f}. (Sin presupuesto declarado.)",
        )
    diff = round(presupuesto - total, 2)
    dentro = diff >= 0
    estado = "DENTRO" if dentro else "EXCEDE"
    return ResultadoPresupuesto(
        costo_total=total,
        dentro_presupuesto=dentro,
        diferencia=diff,
        lineas=lineas,
        detalle=(
            f"Costo total ${total:,.0f} vs presupuesto ${presupuesto:,.0f} → {estado} "
            f"por ${abs(diff):,.0f}."
        ),
    )
