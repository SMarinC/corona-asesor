export type LogLevel = "info" | "warn" | "error";

/** One JSON object per line, so Vercel's log search can filter by field. */
export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
