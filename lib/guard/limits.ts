/** Shared by the API guard and the chat client (history trimming included); kept free of imports so the browser bundle stays small. */
export const MAX_MESSAGE_CHARS = 1_000;
export const MAX_HISTORY_MESSAGES = 20;
/** Budget for the history resent on every agent step, measured as JSON length. */
export const MAX_HISTORY_BYTES = 64 * 1024;

/** Keeps the last `max` messages and drops leading assistant turns so history starts with the user. */
export function truncateHistory<T extends { role: string }>(messages: T[], max: number = MAX_HISTORY_MESSAGES): T[] {
  const tail = messages.slice(-max);
  const firstUser = tail.findIndex((m) => m.role === "user");
  return firstUser <= 0 ? tail : tail.slice(firstUser);
}

/** Drops the oldest messages until the history fits the budget; always keeps the last message and starts with a user turn. */
export function fitHistoryBudget<T extends { role: string }>(messages: T[], maxBytes: number = MAX_HISTORY_BYTES): T[] {
  let start = 0;
  while (start < messages.length - 1 && (JSON.stringify(messages.slice(start)).length > maxBytes || messages[start].role !== "user")) start++;
  return messages.slice(start);
}
