"""Tests de los cálculos deterministas y del motor de reglas.

Correr con:  pytest -q
"""
import math

import pytest

from src.calc import calculations as calc
from src.rules.compatibility import ProyectoSpec, Estado, evaluar_combinacion


# --------------------------------------------------------------------------- #
#  Área y desperdicio
# --------------------------------------------------------------------------- #
def test_area_basica():
    r = calc.calcular_area(4, 3, 0.10)
    assert r.area_util_m2 == 12.0
    assert r.area_con_desperdicio_m2 == pytest.approx(13.2)


def test_area_desperdicio_cero():
    r = calc.calcular_area(5, 2, 0.0)
    assert r.area_con_desperdicio_m2 == 10.0


def test_area_invalida():
    with pytest.raises(ValueError):
        calc.calcular_area(0, 3)


# --------------------------------------------------------------------------- #
#  Cajas
# --------------------------------------------------------------------------- #
def test_cajas_redondea_arriba():
    r = calc.calcular_cajas(13.2, 1.44)
    assert r.cajas == 10          # 13.2 / 1.44 = 9.16 -> 10
    assert r.m2_cubiertos == pytest.approx(14.4)
    assert r.requiere_revision is False


def test_cajas_sin_dato():
    r = calc.calcular_cajas(13.2, None)
    assert r.requiere_revision is True
    assert r.cajas == 0


# --------------------------------------------------------------------------- #
#  Pegante
# --------------------------------------------------------------------------- #
def test_pegante_ok():
    r = calc.calcular_pegante(13.2, 4.5, 25)
    assert r.kg_necesarios == pytest.approx(59.4)
    assert r.bultos == 3          # ceil(59.4 / 25) = 3
    assert r.requiere_revision is False


def test_pegante_sin_rendimiento():
    r = calc.calcular_pegante(13.2, None, 25)
    assert r.requiere_revision is True


# --------------------------------------------------------------------------- #
#  Boquilla
# --------------------------------------------------------------------------- #
def test_boquilla_ok():
    # baldosa 600x600 mm, espesor 9 mm, junta 3 mm, presentación 2 kg
    r = calc.calcular_boquilla(13.2, 600, 600, 9, 3, 2)
    assert r.requiere_revision is False
    assert r.kg_necesarios > 0
    assert r.unidades == math.ceil(r.kg_necesarios / 2)


def test_boquilla_sin_medidas():
    r = calc.calcular_boquilla(13.2, None, 600, 9, 3, 2)
    assert r.requiere_revision is True


# --------------------------------------------------------------------------- #
#  Presupuesto
# --------------------------------------------------------------------------- #
def test_presupuesto_dentro():
    lineas = [
        calc.LineaCosto("Cajas", 10, 89900, 899000),
        calc.LineaCosto("Pegante", 3, 42900, 128700),
    ]
    r = calc.calcular_presupuesto(lineas, 2_500_000)
    assert r.costo_total == pytest.approx(1_027_700)
    assert r.dentro_presupuesto is True
    assert r.diferencia == pytest.approx(1_472_300)


def test_presupuesto_excede():
    lineas = [calc.LineaCosto("Cajas", 30, 109900, 3_297_000)]
    r = calc.calcular_presupuesto(lineas, 2_500_000)
    assert r.dentro_presupuesto is False
    assert r.diferencia < 0


# --------------------------------------------------------------------------- #
#  Reglas de compatibilidad
# --------------------------------------------------------------------------- #
_PISO_INTERIOR = {
    "sku": "PISO-001", "categoria": "piso", "formato": "60x60", "trafico": "alto",
    "materiales": ["Cerámica"],
    "uso_interior": True, "uso_exterior": False, "resistencia_humedad": "alta",
    "disponibilidad": True,
}
_PEG_OK = {
    "sku": "PEG-001", "tipos_revestimiento_compatibles": ["cerámica", "porcelanato"],
    "uso_interior": True, "disponibilidad": True,
}
_BOQ_OK = {
    "sku": "BOQ-001", "junta_min_mm": 1, "junta_max_mm": 5, "disponibilidad": True,
}


def test_compatibilidad_ok():
    proy = ProyectoSpec(ambiente="interior", zona_humeda=True, trafico="alto", ancho_junta_mm=3)
    v = evaluar_combinacion(_PISO_INTERIOR, proy, _PEG_OK, _BOQ_OK)
    assert v.estado == Estado.COMPATIBLE


def test_incompatible_exterior():
    proy = ProyectoSpec(ambiente="exterior", trafico="alto")
    v = evaluar_combinacion(_PISO_INTERIOR, proy)
    assert v.estado == Estado.INCOMPATIBLE


def test_requiere_revision_sin_junta():
    proy = ProyectoSpec(ambiente="interior", trafico="alto")  # sin ancho_junta_mm
    v = evaluar_combinacion(_PISO_INTERIOR, proy, _PEG_OK, _BOQ_OK)
    assert v.estado == Estado.REQUIERE_REVISION


def test_incompatible_junta_fuera_de_rango():
    proy = ProyectoSpec(ambiente="interior", trafico="alto", ancho_junta_mm=8)
    v = evaluar_combinacion(_PISO_INTERIOR, proy, _PEG_OK, _BOQ_OK)  # boquilla 1-5mm
    assert v.estado == Estado.INCOMPATIBLE
