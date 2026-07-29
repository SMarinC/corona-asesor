import {
  Calculator,
  Search,
  Package,
  Boxes,
  Droplets,
  ShieldCheck,
  Wallet,
  FileDown,
  BookOpenText,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface ToolMeta {
  icon: LucideIcon;
  label: string;
}

// Etiqueta e ícono en español por cada una de las 11 tools reales del
// agente (ver src/agent/tools.py), para el panel de traza (TracePanel.tsx).
const META: Record<string, ToolMeta> = {
  calcular_area: { icon: Calculator, label: "Cálculo de área" },
  buscar_revestimientos: { icon: Search, label: "Búsqueda de revestimientos" },
  buscar_pegantes: { icon: Search, label: "Búsqueda de pegantes" },
  buscar_boquillas: { icon: Search, label: "Búsqueda de boquillas" },
  get_producto: { icon: Package, label: "Detalle de producto" },
  calcular_cajas: { icon: Boxes, label: "Cálculo de cajas" },
  calcular_pegante: { icon: Droplets, label: "Cálculo de pegante" },
  calcular_boquilla: { icon: Droplets, label: "Cálculo de boquilla" },
  validar_compatibilidad: { icon: ShieldCheck, label: "Validación de compatibilidad" },
  calcular_presupuesto: { icon: Wallet, label: "Cálculo de presupuesto" },
  generar_cotizacion_pdf: { icon: FileDown, label: "Generación de cotización" },
  buscar_evidencia: { icon: BookOpenText, label: "Evidencia en fichas técnicas" },
};

export function toolMeta(tool: string): ToolMeta {
  return META[tool] ?? { icon: Wrench, label: tool };
}
