import type { UIMessage } from "ai";
import { z } from "zod";
import { fitHistoryBudget, MAX_HISTORY_BYTES, MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, truncateHistory } from "./limits";

export { fitHistoryBudget, MAX_HISTORY_BYTES, MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, truncateHistory };
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
    let total = 0;
    for (const part of message.parts) {
      const text = (part as { text?: unknown }).text;
      if (part.type !== "text" || typeof text !== "string") return { ok: false, reason: "unsupported_user_part" };
      total += text.length;
    }
    if (total > MAX_MESSAGE_CHARS) return { ok: false, reason: "message_too_long" };
  }

  const last = parsed.data.messages.at(-1);
  const lastText = last?.role === "user" ? last.parts.map((p) => (p as { text?: string }).text ?? "").join("").trim() : "";
  if (lastText.length === 0) return { ok: false, reason: "last_message_not_user" };

  // Shape-checked here. In the handler, safeValidateUIMessages then checks the UI-message structure and each tool
  // part's input against that tool's inputSchema. Tool outputs in the history are NOT validated: our tools declare
  // no outputSchema, so a replayed tool output reaches the model as the client sent it.
  return { ok: true, messages: fitHistoryBudget(truncateHistory(parsed.data.messages as unknown as UIMessage[])) };
}
