"""Estado del proyecto que el agente mantiene durante la conversación.

Es un objeto simple y serializable: guarda lo que el usuario ha declarado y las
selecciones hechas, para que el orquestador no pierda contexto entre pasos.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class ProjectState:
    # --- Datos del espacio ---
    largo_m: float | None = None
    ancho_m: float | None = None
    categoria: str | None = None          # "piso" | "pared"

    # --- Condiciones ---
    ambiente: str = "interior"            # "interior" | "exterior"
    zona_humeda: bool = False
    trafico: str = "medio"                # "bajo" | "medio" | "alto"
    ancho_junta_mm: float | None = None
    presupuesto: float | None = None

    # --- Preferencias declaradas ---
    preferencias: list[str] = field(default_factory=list)  # "claro", "fácil de limpiar"…

    # --- Selecciones ---
    sku_revestimiento: str | None = None
    sku_pegante: str | None = None
    sku_boquilla: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def resumen(self) -> str:
        area = (self.largo_m * self.ancho_m) if (self.largo_m and self.ancho_m) else None
        partes = []
        if area:
            partes.append(f"área {area:.1f} m² ({self.largo_m}×{self.ancho_m} m)")
        if self.categoria:
            partes.append(self.categoria)
        partes.append(self.ambiente)
        if self.zona_humeda:
            partes.append("zona húmeda")
        partes.append(f"tráfico {self.trafico}")
        if self.presupuesto:
            partes.append(f"presupuesto ${self.presupuesto:,.0f}")
        return " · ".join(partes)
