export interface TraceStep {
  tool: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  contenido: string;
  trace?: TraceStep[];
  error?: string | null;
  pending?: boolean;
}

export interface Producto {
  sku: string;
  nombre: string;
  categoria: string;
  subcategoria?: string;
  precio?: number | null;
  moneda?: string | null;
  disponibilidad?: boolean;
  url?: string | null;
  imagen?: string | null;
  imagenes?: string[];
  acabado?: string | null;
  diseno?: string | null;
  formato?: string | null;
  [key: string]: unknown;
}

export interface ChatApiResponse {
  texto: string;
  trace: TraceStep[];
  truncado?: boolean;
  error?: string | null;
}
