import type { ChatErrorCode } from "@/lib/guard/errors";
import { formatWait } from "./format";

export type ChatErrorKind = ChatErrorCode | "network";

export interface ChatErrorView {
  kind: ChatErrorKind;
  /** Seconds to wait before sending again; null when the server gave none. */
  retryAfter: number | null;
}

const CODES = new Set<string>(["bot_detected", "rate_limited", "quota_exhausted", "invalid_input", "model_error"]);
/** Sliding-window limits can report a reset only a second away; never re-enable the input sooner than this. */
export const MIN_RETRY_SECONDS = 5;

const isCode = (value: unknown): value is ChatErrorCode => typeof value === "string" && CODES.has(value);

/**
 * useChat surfaces two shapes: an APICallError whose responseBody is our JSON error (rejected before streaming),
 * or an Error whose message is the code from the stream's error chunk (failed mid-turn).
 */
export function parseChatError(error: unknown): ChatErrorView {
  const responseBody = (error as { responseBody?: unknown } | null)?.responseBody;
  if (typeof responseBody === "string") {
    try {
      const body = JSON.parse(responseBody) as { error?: { code?: unknown; retryAfter?: unknown } };
      const code = body.error?.code;
      if (isCode(code)) {
        const given = typeof body.error?.retryAfter === "number" ? body.error.retryAfter : null;
        const retryAfter = code === "rate_limited" ? Math.max(given ?? 0, MIN_RETRY_SECONDS) : given;
        return { kind: code, retryAfter };
      }
    } catch {
      // Not our JSON (for example a platform error page): fall through.
    }
  }
  const message = error instanceof Error ? error.message.trim() : "";
  if (isCode(message)) return { kind: message, retryAfter: null };
  if (error instanceof TypeError || /failed to fetch|network/i.test(message)) return { kind: "network", retryAfter: null };
  return { kind: "model_error", retryAfter: null };
}

/** What happened and what to do next. `remaining` is the live countdown in seconds. */
export function chatErrorCopy(view: ChatErrorView, remaining: number | null): string {
  const waiting = remaining !== null && remaining > 0;
  switch (view.kind) {
    case "rate_limited":
      return waiting
        ? `Enviaste varios mensajes seguidos. Puedes escribir de nuevo en ${formatWait(remaining)}.`
        : "Ya puedes escribir de nuevo.";
    case "quota_exhausted":
      return waiting
        ? `La demo usó el cupo disponible del modelo gratuito. Vuelve a intentarlo en ${formatWait(remaining)}.`
        : "La demo usó el cupo disponible del modelo gratuito. Vuelve a intentarlo más tarde.";
    case "bot_detected":
      return "No pudimos verificar que eres una persona. Recarga la página para intentarlo de nuevo.";
    case "invalid_input":
      return "No pudimos procesar la conversación. Envía un mensaje de texto de hasta 1.000 caracteres o empieza una conversación nueva.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión o desactiva bloqueadores para este sitio, y reintenta.";
    case "model_error":
      return "El asesor no pudo responder esta vez. Reintenta en unos segundos.";
  }
}

/**
 * The chat request's fetch. BotID's fetch wrapper rejects with the challenge script's error `Event`, not an Error,
 * when the server cannot be reached, and useChat only calls onError for Error instances: without this the turn
 * failed silently. Error rejections (aborts included) pass through untouched.
 */
export const chatFetch: typeof fetch = async (input, init) => {
  try {
    return await globalThis.fetch(input, init);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new TypeError("Failed to fetch", { cause: error });
  }
};
