"""Capa de datos estructurados sobre DuckDB — esquema real de Corona.

La base tiene UNA tabla `products` (505 filas) donde los atributos técnicos
viven en un JSON `specifications` (cada valor es una lista de strings). Este
módulo:
  - filtra por categoría/subcategoría, precio y disponibilidad en SQL, y
  - NORMALIZA cada fila a un dict con las claves que usan el motor de reglas y
    los cálculos, derivando interior/exterior, humedad y tráfico de campos
    reales ('Áreas de uso', 'Uso'), y dejando en None lo que la base no trae
    (p. ej. m² por caja) para que el agente lo marque "Requiere revisión".

Categorías reales:
    category='Revestimientos' + subcategory ∈ {'Pisos','Paredes'}
    category='Pegantes'
    category='Boquillas'
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import duckdb

from src import config

# --- vocabulario real derivado de la base ---------------------------------- #
_AREAS_EXTERIOR = {
    "áreas exteriores", "areas exteriores", "terrazas", "interior de piscinas",
    "piscina", "áreas exteriores techadas", "areas exteriores techadas",
}
_AREAS_HUMEDAS = _AREAS_EXTERIOR | {"baño", "bano", "cocina"}
_FORMATO_RE = re.compile(r"(\d{1,3}(?:[.,]\d+)?)\s*[xX×]\s*(\d{1,3}(?:[.,]\d+)?)")
_KGM2_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*kg\s*/?\s*m[²2]", re.IGNORECASE)
_KG_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*kg", re.IGNORECASE)


def _f(x) -> float | None:
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


class DuckDBStore:
    def __init__(self, db_path: Path | str | None = None, read_only: bool = True):
        self.db_path = Path(db_path or config.DUCKDB_PATH)
        self.con = duckdb.connect(str(self.db_path), read_only=read_only)

    # ----------------------------------------------------------- helpers SQL
    def _tables(self) -> set[str]:
        return {r[0] for r in self.con.execute("SHOW TABLES").fetchall()}

    def _rows(self, cur) -> list[dict[str, Any]]:
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    # ----------------------------------------------------- normalización
    @staticmethod
    def _specs(raw) -> dict[str, list]:
        if not raw:
            return {}
        try:
            return json.loads(raw) if isinstance(raw, str) else raw
        except Exception:  # noqa: BLE001
            return {}

    @staticmethod
    def _imagenes(raw) -> list[str]:
        """Extrae la lista de URLs de imagen del campo JSON `images`."""
        if not raw:
            return []
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:  # noqa: BLE001
            return []
        if isinstance(data, list):
            return [str(x) for x in data if x]
        return []

    @staticmethod
    def _first(specs: dict, *keys) -> str | None:
        for k in keys:
            v = specs.get(k)
            if v:
                return str(v[0]) if isinstance(v, list) else str(v)
        return None

    @staticmethod
    def _list(specs: dict, *keys) -> list[str]:
        out: list[str] = []
        for k in keys:
            v = specs.get(k)
            if isinstance(v, list):
                out += [str(x) for x in v]
            elif v:
                out.append(str(v))
        return out

    def _normalizar(self, row: dict) -> dict[str, Any]:
        """Convierte una fila cruda de `products` en el dict que consumen las
        reglas y los cálculos."""
        specs = self._specs(row.get("specifications"))
        cat = row.get("category")
        sub = row.get("subcategory") or ""
        name = row.get("name") or ""

        # tipo simple
        if cat == "Revestimientos":
            tipo = "piso" if "piso" in sub.lower() else "pared"
        elif cat == "Pegantes":
            tipo = "pegante"
        elif cat == "Boquillas":
            tipo = "boquilla"
        else:
            tipo = (cat or "").lower()

        imagenes = self._imagenes(row.get("images"))
        base = {
            "sku": row.get("sku"),
            "nombre": name,
            "categoria": tipo,                       # piso|pared|pegante|boquilla
            "subcategoria": sub,
            "precio": _f(row.get("price")),
            "moneda": row.get("currency"),
            "disponibilidad": bool(row.get("is_in_stock")),
            "url": row.get("url"),
            "imagen": imagenes[0] if imagenes else None,
            "imagenes": imagenes,
            "ficha_tecnica_url": row.get("ficha_tecnica_url"),
            "uso": self._list(specs, "Uso"),
        }

        if tipo in ("piso", "pared"):
            areas = self._list(specs, "Áreas de uso", "Areas de uso")
            areas_lc = {a.lower() for a in areas}
            interior = bool(areas_lc - _AREAS_EXTERIOR) or "áreas interiores" in areas_lc
            exterior = bool(areas_lc & _AREAS_EXTERIOR)
            uso = [u.lower() for u in base["uso"]]
            if "institucional" in uso or "áreas comerciales" in areas_lc or "areas comerciales" in areas_lc:
                trafico = "alto"
            elif "residencial" in uso or "hogar" in uso:
                trafico = "medio"
            else:
                trafico = None
            largo_mm, ancho_mm = self._formato_mm(name, specs)
            base.update({
                "formato": self._first(specs, "Formato") or self._formato_str(name),
                "formato_largo_mm": largo_mm,
                "formato_ancho_mm": ancho_mm,
                "acabado": self._first(specs, "Acabado"),
                "diseno": self._first(specs, "Diseño", "Diseno"),
                "aspecto": self._first(specs, "Aspecto"),
                "materiales": self._list(specs, "Materiales"),
                "areas_uso": areas,
                "uso_interior": interior,
                "uso_exterior": exterior,
                # humedad: apto si la ficha lo lista para áreas húmedas; si no, desconocido
                "resistencia_humedad": "alta" if (areas_lc & _AREAS_HUMEDAS) else None,
                "trafico": trafico,
                "espesor_mm": _f(self._first(specs, "Espesor")),
                # la base NO trae m² por caja -> se resolverá desde la ficha (Chroma)
                "m2_por_caja": None,
            })
        elif tipo == "pegante":
            base.update({
                "tipo": self._tipo_pegante(name, sub),
                "tipos_revestimiento_compatibles": self._compat_material(name, sub),
                "rendimiento_texto": self._first(specs, "Rendimiento"),
                "rendimiento_kg_m2": self._parse_kgm2(self._list(specs, "Rendimiento")),
                "presentacion_kg": self._parse_kg(self._list(specs, "Presentación", "Contenido del producto") + [name]),
                "uso_interior": True,
                "uso_exterior": "flex" in name.lower() or "ultra" in name.lower() or "max" in name.lower(),
            })
        elif tipo == "boquilla":
            jmin, jmax = self._junta_desde_subcat(sub, name)
            base.update({
                "tipo": "epoxica" if "spectralock" in name.lower() or "epox" in name.lower() else "cementicia",
                "rendimiento_texto": self._first(specs, "Rendimiento"),
                "presentacion_kg": self._parse_kg(self._list(specs, "Presentación", "Contenido del producto") + [name, sub]),
                "junta_min_mm": jmin,
                "junta_max_mm": jmax,
                "uso_interior": True,
                "uso_exterior": True,
            })
        return base

    # --------------------------------------------------- parsers auxiliares
    @staticmethod
    def _formato_str(name: str) -> str | None:
        m = _FORMATO_RE.search(name or "")
        return f"{m.group(1)}x{m.group(2)}" if m else None

    @staticmethod
    def _formato_mm(name, specs):
        txt = (specs.get("Formato", [None])[0] if specs.get("Formato") else None) or name or ""
        m = _FORMATO_RE.search(str(txt))
        if not m:
            return (None, None)
        return (_f(m.group(1)) * 10, _f(m.group(2)) * 10)  # cm -> mm

    @staticmethod
    def _parse_kgm2(textos: list[str]) -> float | None:
        for t in textos:
            m = _KGM2_RE.search(t)
            if m:
                return _f(m.group(1))
        return None

    @staticmethod
    def _parse_kg(textos: list[str]) -> float | None:
        for t in textos:
            m = _KG_RE.search(t)
            if m:
                return _f(m.group(1))
        return None

    @staticmethod
    def _tipo_pegante(name, sub):
        s = f"{name} {sub}".lower()
        if "porcel" in s:
            return "porcelanato"
        if "gran formato" in s or "capa gruesa" in s:
            return "gran formato"
        if "cerámic" in s or "ceramic" in s:
            return "ceramica"
        return "general"

    @staticmethod
    def _compat_material(name, sub):
        s = f"{name} {sub}".lower()
        comp = []
        if "porcel" in s:
            comp += ["porcelanato", "porcelánico", "cerámica"]
        if "cerámic" in s or "ceramic" in s:
            comp += ["cerámica", "ceramica"]
        if "gran formato" in s or "capa gruesa" in s:
            comp += ["gran formato", "porcelanato"]
        if "flex" in s or "ultra" in s or "max" in s:
            comp += ["porcelanato", "cerámica", "gran formato"]
        return sorted(set(comp)) or None

    @staticmethod
    def _junta_desde_subcat(sub, name):
        s = f"{sub} {name}".lower()
        if "estrecha" in s:
            return (1.0, 5.0)
        if "universal" in s:
            return (1.5, 12.0)
        if "max" in s:
            return (3.0, 20.0)
        return (None, None)

    # ------------------------------------------------------------- queries
    def get_producto(self, sku: str) -> dict[str, Any] | None:
        if "products" not in self._tables():
            return None
        cur = self.con.execute("SELECT * FROM products WHERE sku = ?", [str(sku)])
        rows = self._rows(cur)
        return self._normalizar(rows[0]) if rows else None

    # compatibilidad con la firma anterior: get_producto(tabla, sku)
    def get_producto_tabla(self, tabla: str, sku: str) -> dict[str, Any] | None:
        return self.get_producto(sku)

    def _buscar(self, where: list[str], params: list, limit: int) -> list[dict]:
        sql = "SELECT * FROM products"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY (price IS NULL), price ASC"
        sql += f" LIMIT {int(limit)}"
        crudos = self._rows(self.con.execute(sql, params))
        return [self._normalizar(r) for r in crudos]

    def buscar_revestimientos(
        self,
        categoria: str | None = None,     # "piso" | "pared"
        ambiente: str | None = None,      # "interior" | "exterior"
        acabado: str | None = None,
        diseno: str | None = None,
        color: str | None = None,         # busca en el nombre (p. ej. "blanco")
        zona_humeda: bool | None = None,
        precio_max: float | None = None,
        solo_disponibles: bool = True,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        where = ["category = 'Revestimientos'"]
        params: list[Any] = []
        if categoria == "piso":
            where.append("subcategory = 'Pisos'")
        elif categoria == "pared":
            where.append("subcategory = 'Paredes'")
        if precio_max is not None:
            where.append("price IS NOT NULL AND price <= ?"); params.append(float(precio_max))
        if solo_disponibles:
            where.append("is_in_stock = TRUE")
        if color:
            where.append("lower(name) LIKE ?"); params.append(f"%{color.lower()}%")
        # traemos un excedente y afinamos por specs en Python
        cand = self._buscar(where, params, max(limit * 4, 20))

        def ok(p):
            if acabado and (p.get("acabado") or "").lower() != acabado.lower():
                return False
            if diseno and diseno.lower() not in (p.get("diseno") or "").lower():
                return False
            if ambiente == "exterior" and not p.get("uso_exterior"):
                return False
            if ambiente == "interior" and not p.get("uso_interior"):
                return False
            if zona_humeda and not p.get("resistencia_humedad"):
                return False
            return True

        return [p for p in cand if ok(p)][:limit]

    def buscar_pegantes(self, tipo: str | None = None, solo_disponibles: bool = True,
                        limit: int = 8) -> list[dict[str, Any]]:
        where = ["category = 'Pegantes'"]
        params: list[Any] = []
        if solo_disponibles:
            where.append("is_in_stock = TRUE")
        cand = self._buscar(where, params, max(limit * 3, 15))
        if tipo:
            cand = [p for p in cand if tipo.lower() in (p.get("tipo") or "")
                    or (p.get("tipos_revestimiento_compatibles") and
                        any(tipo.lower() in c for c in p["tipos_revestimiento_compatibles"]))]
        return cand[:limit]

    def buscar_boquillas(self, ancho_junta_mm: float | None = None,
                        solo_disponibles: bool = True, limit: int = 8) -> list[dict[str, Any]]:
        where = ["category = 'Boquillas'"]
        params: list[Any] = []
        if solo_disponibles:
            where.append("is_in_stock = TRUE")
        cand = self._buscar(where, params, max(limit * 4, 25))
        if ancho_junta_mm is not None:
            cand = [p for p in cand if p.get("junta_min_mm") is not None
                    and p["junta_min_mm"] <= ancho_junta_mm <= p["junta_max_mm"]]
        return cand[:limit]

    def close(self):
        self.con.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
