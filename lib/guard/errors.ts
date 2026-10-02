import { APICallError, RetryError } from "ai";

export type ChatErrorCode = "bot_detected" | "rate_limited" | "quota_exhausted" | "invalid_input" | "model_error";

export interface ChatErrorBody {
  error: { code: ChatErrorCode; message: string; retryAfter?: number };
}

const STATUS: Record<ChatErrorCode, number> = {
  bot_detected: 403,
  rate_limited: 429,
  quota_exhausted: 429,
  invalid_input: 400,
  model_error: 500,
};

const MESSAGE_ES: Record<ChatErrorCode, string> = {
  bot_detected: "No pudimos verificar que seas una persona. Recarga la página e inténtalo de nuevo.",
  rate_limited: "Enviaste muchos mensajes seguidos. Espera un momento antes de continuar.",
  quota_exhausted: "La demo alcanzó su límite de uso por ahora. Vuelve a intentarlo más tarde.",
  invalid_input: "No pudimos procesar la conversación. Envía un mensaje de texto de hasta 1.000 caracteres o empieza una conversación nueva.",
  model_error: "El asistente no está disponible en este momento. Inténtalo de nuevo.",
};

/** Errors before streaming starts: typed JSON, Spanish message, no internals. */
export function errorResponse(code: ChatErrorCode, options: { retryAfter?: number } = {}): Response {
  const body: ChatErrorBody = {
    error: { code, message: MESSAGE_ES[code], ...(options.retryAfter !== undefined && { retryAfter: options.retryAfter }) },
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.retryAfter !== undefined) headers["retry-after"] = String(options.retryAfter);
  return new Response(JSON.stringify(body), { status: STATUS[code], headers });
}

/** Errors during streaming reach the client as an error chunk whose text is this code. */
export function streamErrorCode(error: unknown): ChatErrorCode {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause) && cause.statusCode === 429) return "quota_exhausted";
  return "model_error";
}
