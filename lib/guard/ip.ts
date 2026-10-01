import { createHash } from "node:crypto";

/** On Vercel the platform sets x-forwarded-for; its first entry is the client. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Raw IPs never reach logs or Redis keys. */
export function hashIp(ip: string, salt: string = process.env.IP_HASH_SALT ?? ""): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
