import type { UIMessage } from "ai";
import { z } from "zod";

export const MAX_MESSAGE_CHARS = 1_000;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_BODY_BYTES = 512 * 1024;

const messageSchema = z
  .object({
    id: z.string().max(100),
    // "system" is a valid UIMessage role, but clients must never inject one.
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.object({ type: z.string() }).loose()).max(100),
  })
  .loose();

const bodySchema = z.object({ messages: z.array(messageSchema).min(1).max(200) }).loose();

export type ParsedChat = { ok: true; messages: UIMessage[] } | { ok: false; reason: string };

/** Keeps the last `max` messages and drops leading assistant turns so history starts with the user. */
export function truncateHistory<T extends { role: string }>(messages: T[], max: number = MAX_HISTORY_MESSAGES): T[] {
  const tail = messages.slice(-max);
  const firstUser = tail.findIndex((m) => m.role === "user");
  return firstUser <= 0 ? tail : tail.slice(firstUser);
}

export async function parseChatRequest(req: Request): Promise<ParsedChat> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return { ok: false, reason: "body_too_large" };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_shape" };

  for (const message of parsed.data.messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      const text = (part as { text?: unknown }).text;
      if (part.type !== "text" || typeof text !== "string") return { ok: false, reason: "unsupported_user_part" };
      if (text.length > MAX_MESSAGE_CHARS) return { ok: false, reason: "message_too_long" };
    }
  }

  const last = parsed.data.messages.at(-1);
  const lastText = last?.role === "user" ? last.parts.map((p) => (p as { text?: string }).text ?? "").join("").trim() : "";
  if (lastText.length === 0) return { ok: false, reason: "last_message_not_user" };

  // Shape-checked here; tool parts are validated against the tool schemas by safeValidateUIMessages in the handler.
  return { ok: true, messages: truncateHistory(parsed.data.messages as unknown as UIMessage[]) };
}
