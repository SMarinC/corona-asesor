import { type Duration, Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { log } from "@/lib/log";

export interface LimitResult {
  success: boolean;
  /** Epoch ms when the window resets. */
  reset: number;
  remaining: number;
}

export interface RateLimiter {
  /** Records `cost` units (default 1) and says whether the caller is still within the limit. */
  limit(key: string, cost?: number): Promise<LimitResult>;
}

export interface GuardLimits {
  perIpShort: RateLimiter;
  perIpDaily: RateLimiter;
  /** Counts model calls across all users per minute, to stay under the free-tier requests-per-minute. */
  globalPerMinute: RateLimiter;
  /** Counts model calls across all users, to stay under the free-tier requests-per-day. */
  globalDaily: RateLimiter;
}

export interface GuardConfig {
  perIpPer10Min: number;
  perIpPerDay: number;
  globalDailyCap: number;
  globalPerMinuteCap: number;
}

export type LimitCheck = { ok: true } | { ok: false; code: "rate_limited" | "quota_exhausted"; retryAfter: number };

type Env = Record<string, string | undefined>;

export const GLOBAL_KEY = "global";
export const DEFAULT_GUARD_CONFIG: GuardConfig = { perIpPer10Min: 15, perIpPerDay: 60, globalDailyCap: 200, globalPerMinuteCap: 12 };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n > 0 ? n : fallback;
}

export function readGuardConfig(env: Env = process.env): GuardConfig {
  return {
    perIpPer10Min: positiveInt(env.RATE_LIMIT_PER_10_MIN, DEFAULT_GUARD_CONFIG.perIpPer10Min),
    perIpPerDay: positiveInt(env.RATE_LIMIT_PER_DAY, DEFAULT_GUARD_CONFIG.perIpPerDay),
    globalDailyCap: positiveInt(env.GLOBAL_DAILY_REQUEST_CAP, DEFAULT_GUARD_CONFIG.globalDailyCap),
    globalPerMinuteCap: positiveInt(env.GLOBAL_PER_MINUTE_CAP, DEFAULT_GUARD_CONFIG.globalPerMinuteCap),
  };
}

/** Fixed-window counter for local dev and tests. Like Upstash, it records the cost before comparing. */
export function createMemoryLimiter({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async limit(key, cost = 1) {
      const t = now();
      let window = windows.get(key);
      if (!window || t - window.start >= windowMs) {
        window = { start: t, count: 0 };
        windows.set(key, window);
      }
      window.count += cost;
      return { success: window.count <= limit, reset: window.start + windowMs, remaining: Math.max(0, limit - window.count) };
    },
  };
}

export function createMemoryGuardLimits(config: GuardConfig, now: () => number = Date.now): GuardLimits {
  return {
    perIpShort: createMemoryLimiter({ limit: config.perIpPer10Min, windowMs: 10 * MINUTE_MS, now }),
    perIpDaily: createMemoryLimiter({ limit: config.perIpPerDay, windowMs: DAY_MS, now }),
    globalPerMinute: createMemoryLimiter({ limit: config.globalPerMinuteCap, windowMs: MINUTE_MS, now }),
    globalDaily: createMemoryLimiter({ limit: config.globalDailyCap, windowMs: DAY_MS, now }),
  };
}

/** A slow Redis must not eat the turn's time budget: past this, a check passes (fails open) and is logged. */
export const UPSTASH_TIMEOUT_MS = 1_000;

export function createUpstashLimiter(
  redis: Redis,
  options: { limit: number; window: Duration; prefix: string; sliding: boolean; timeoutMs?: number },
): RateLimiter {
  const ratelimit = new Ratelimit({
    redis,
    prefix: options.prefix,
    limiter: options.sliding ? Ratelimit.slidingWindow(options.limit, options.window) : Ratelimit.fixedWindow(options.limit, options.window),
    timeout: options.timeoutMs ?? UPSTASH_TIMEOUT_MS,
  });
  return {
    async limit(key, cost = 1) {
      const { success, reset, remaining, reason } = await ratelimit.limit(key, { rate: cost });
      if (reason === "timeout") log("warn", "rate_limit_timeout", { prefix: options.prefix });
      return { success, reset, remaining };
    },
  };
}

/** Upstash when configured (Vercel Marketplace sets KV_REST_API_*); otherwise per-instance memory. */
export function createGuardLimits(config: GuardConfig, env: Env = process.env): GuardLimits {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) {
    // In production this means the global caps multiply with the number of instances: make it loud.
    log(env.VERCEL_ENV === "production" ? "error" : "warn", "rate_limit_memory_fallback", {
      reason: "Upstash env vars missing; limits apply per server instance only.",
    });
    return createMemoryGuardLimits(config);
  }
  // One quick retry instead of the client's default five with exponential backoff (about 4 s when Redis is down).
  const redis = new Redis({ url, token, retry: { retries: 1, backoff: () => 100 } });
  return {
    perIpShort: createUpstashLimiter(redis, { limit: config.perIpPer10Min, window: "10 m", prefix: "corona:ip:10m", sliding: true }),
    perIpDaily: createUpstashLimiter(redis, { limit: config.perIpPerDay, window: "1 d", prefix: "corona:ip:1d", sliding: true }),
    // Fixed UTC minute, matching the free-tier requests-per-minute window.
    globalPerMinute: createUpstashLimiter(redis, { limit: config.globalPerMinuteCap, window: "1 m", prefix: "corona:global:1m", sliding: false }),
    // A fixed UTC day, close to how the free-tier daily quota resets.
    globalDaily: createUpstashLimiter(redis, { limit: config.globalDailyCap, window: "1 d", prefix: "corona:global:1d", sliding: false }),
  };
}

const secondsUntil = (reset: number, now: number) => Math.max(1, Math.ceil((reset - now) / 1000));

/**
 * Order: per-IP short, per-IP daily, global per-minute, global daily.
 * A blocked IP never spends either global counter, and a blocked minute never spends the daily one.
 */
export async function checkLimits(limits: GuardLimits, ipKey: string, now: number = Date.now()): Promise<LimitCheck> {
  for (const limiter of [limits.perIpShort, limits.perIpDaily]) {
    const result = await limiter.limit(ipKey);
    if (!result.success) return { ok: false, code: "rate_limited", retryAfter: secondsUntil(result.reset, now) };
  }
  const minute = await limits.globalPerMinute.limit(GLOBAL_KEY);
  if (!minute.success) return { ok: false, code: "rate_limited", retryAfter: secondsUntil(minute.reset, now) };
  const global = await limits.globalDaily.limit(GLOBAL_KEY);
  if (!global.success) return { ok: false, code: "quota_exhausted", retryAfter: secondsUntil(global.reset, now) };
  return { ok: true };
}

/**
 * Charges `calls` model calls (default 1) to both global counters. The guard already reserved a turn's first call;
 * the chat handler charges each later one as it starts, so aborted and failed turns are counted too.
 */
export async function recordModelCall(limits: GuardLimits, calls = 1): Promise<void> {
  if (calls <= 0) return;
  await Promise.all([limits.globalPerMinute.limit(GLOBAL_KEY, calls), limits.globalDaily.limit(GLOBAL_KEY, calls)]);
}
