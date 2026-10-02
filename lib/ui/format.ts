const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** Colombian pesos as the agent writes them: "$612.300". */
export function formatCOP(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${integer.format(Math.abs(Math.round(value)))}`;
}

/** Decimal comma, at most two decimals: 6.6 → "6,6". */
export const formatNumber = (value: number): string => decimal.format(value);

export const formatM2 = (value: number): string => `${formatNumber(value)} m²`;

/** 552 × 552 mm → "55,2 × 55,2 cm". */
export const formatFormat = (format: { length: number; width: number }): string =>
  `${formatNumber(format.length / 10)} × ${formatNumber(format.width / 10)} cm`;

/** Milliseconds as "0,8 s", or "45 ms" under a tenth of a second. */
export function formatDuration(ms: number): string {
  if (ms < 100) return `${Math.max(0, Math.round(ms))} ms`;
  return `${formatNumber(Math.round(ms / 100) / 10)} s`;
}

/** Seconds as "45 s", "3 min" or "2 h 05 min", for retry countdowns. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.ceil((s % 3600) / 60);
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

/** "1 caja" / "4 cajas", "1 bulto" / "2 bultos", "1 unidad" / "3 unidades". */
export function formatQuantity(quantity: number, unit: "caja" | "bulto" | "unidad"): string {
  const plural = { caja: "cajas", bulto: "bultos", unidad: "unidades" }[unit];
  return `${quantity} ${quantity === 1 ? unit : plural}`;
}
