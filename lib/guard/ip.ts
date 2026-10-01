import { createHmac } from "node:crypto";
import { log } from "@/lib/log";

let warnedMissingSalt = false;

/** On Vercel the platform sets x-forwarded-for; its first entry is the client. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Raw IPs never reach logs or Redis keys. Keyed HMAC, so a missing salt is still not a plain sha256
 * of the IP; but set IP_HASH_SALT, otherwise the IPv4 space can be brute-forced offline.
 */
export function hashIp(ip: string, salt: string = process.env.IP_HASH_SALT ?? ""): string {
  if (!salt && !warnedMissingSalt) {
    warnedMissingSalt = true;
    log(process.env.VERCEL_ENV === "production" ? "error" : "warn", "ip_hash_salt_missing", {
      reason: "IP_HASH_SALT is empty; IP hashes are easier to reverse.",
    });
  }
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 16);
}
