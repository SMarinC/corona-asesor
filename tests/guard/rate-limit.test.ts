import { describe, expect, it, vi } from "vitest";
import {
  checkLimits,
  createGuardLimits,
  createMemoryGuardLimits,
  createMemoryLimiter,
  createUpstashLimiter,
  DEFAULT_GUARD_CONFIG,
  GLOBAL_KEY,
  readGuardConfig,
  recordModelCall,
} from "@/lib/guard/rate-limit";

describe("createMemoryLimiter", () => {
  it("allows up to the limit per window, then blocks until reset", async () => {
    let now = 1_000;
    const limiter = createMemoryLimiter({ limit: 2, windowMs: 60_000, now: () => now });
    expect((await limiter.limit("ip")).success).toBe(true);
    expect((await limiter.limit("ip")).success).toBe(true);
    const blocked = await limiter.limit("ip");
    expect(blocked).toMatchObject({ success: false, remaining: 0, reset: 61_000 });
    expect((await limiter.limit("other-ip")).success).toBe(true);
    now = 61_000;
    expect((await limiter.limit("ip")).success).toBe(true);
  });

  it("counts a cost greater than one", async () => {
    const limiter = createMemoryLimiter({ limit: 5, windowMs: 1_000 });
    expect(await limiter.limit("g", 4)).toMatchObject({ success: true, remaining: 1 });
    expect((await limiter.limit("g", 2)).success).toBe(false);
  });
});

describe("checkLimits", () => {
  it("passes within limits", async () => {
    expect(await checkLimits(createMemoryGuardLimits(DEFAULT_GUARD_CONFIG), "ip")).toEqual({ ok: true });
  });

  it("returns rate_limited with retryAfter in seconds when the per-IP window is used up", async () => {
    const now = 0;
    const limits = createMemoryGuardLimits({ ...DEFAULT_GUARD_CONFIG, perIpPer10Min: 1 }, () => now);
    await checkLimits(limits, "ip", now);
    expect(await checkLimits(limits, "ip", now)).toEqual({ ok: false, code: "rate_limited", retryAfter: 600 });
  });

  it("does not consume either global cap when the IP is blocked", async () => {
    const limits = createMemoryGuardLimits({ ...DEFAULT_GUARD_CONFIG, perIpPer10Min: 1 });
    const minute = vi.spyOn(limits.globalPerMinute, "limit");
    const daily = vi.spyOn(limits.globalDaily, "limit");
    await checkLimits(limits, "ip");
    await checkLimits(limits, "ip");
    expect(minute).toHaveBeenCalledTimes(1);
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it("returns rate_limited with retryAfter when the global per-minute cap is used up", async () => {
    const now = 0;
    const limits = createMemoryGuardLimits({ ...DEFAULT_GUARD_CONFIG, globalPerMinuteCap: 1 }, () => now);
    await checkLimits(limits, "ip-a", now);
    expect(await checkLimits(limits, "ip-b", now)).toEqual({ ok: false, code: "rate_limited", retryAfter: 60 });
  });

  it("does not consume the global daily cap when the minute cap is exhausted", async () => {
    const limits = createMemoryGuardLimits({ ...DEFAULT_GUARD_CONFIG, globalPerMinuteCap: 1 });
    const daily = vi.spyOn(limits.globalDaily, "limit");
    await checkLimits(limits, "ip-a");
    await checkLimits(limits, "ip-b");
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it("returns quota_exhausted when the global daily cap is used up", async () => {
    const limits = createMemoryGuardLimits({ ...DEFAULT_GUARD_CONFIG, globalDailyCap: 1 });
    await checkLimits(limits, "ip-a");
    expect(await checkLimits(limits, "ip-b")).toMatchObject({ ok: false, code: "quota_exhausted" });
  });
});

describe("recordModelCall", () => {
  it("charges one model call, or n, to both global caps", async () => {
    const limits = createMemoryGuardLimits(DEFAULT_GUARD_CONFIG);
    const daily = vi.spyOn(limits.globalDaily, "limit");
    const minute = vi.spyOn(limits.globalPerMinute, "limit");
    await recordModelCall(limits);
    await recordModelCall(limits, 3);
    await recordModelCall(limits, 0);
    expect(daily.mock.calls).toEqual([
      [GLOBAL_KEY, 1],
      [GLOBAL_KEY, 3],
    ]);
    expect(minute.mock.calls).toEqual([
      [GLOBAL_KEY, 1],
      [GLOBAL_KEY, 3],
    ]);
  });
});

describe("readGuardConfig", () => {
  it("uses defaults and ignores invalid values", () => {
    expect(readGuardConfig({})).toEqual({ perIpPer10Min: 15, perIpPerDay: 60, globalDailyCap: 200, globalPerMinuteCap: 12 });
    expect(
      readGuardConfig({ RATE_LIMIT_PER_10_MIN: "5", RATE_LIMIT_PER_DAY: "abc", GLOBAL_DAILY_REQUEST_CAP: "-1", GLOBAL_PER_MINUTE_CAP: "0" }),
    ).toEqual({ perIpPer10Min: 5, perIpPerDay: 60, globalDailyCap: 200, globalPerMinuteCap: 12 });
    expect(readGuardConfig({ GLOBAL_PER_MINUTE_CAP: "10" }).globalPerMinuteCap).toBe(10);
  });
});

describe("createGuardLimits", () => {
  it("falls back to in-memory limits and warns when Upstash is not configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createGuardLimits(DEFAULT_GUARD_CONFIG, {});
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: "rate_limit_memory_fallback" });
    warn.mockRestore();
  });

  it("uses Upstash when the Marketplace variables are present (no network call at construction)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limits = createGuardLimits(DEFAULT_GUARD_CONFIG, { KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "token" });
    expect(typeof limits.globalDaily.limit).toBe("function");
    expect(typeof limits.globalPerMinute.limit).toBe("function");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("hardening", () => {
  it("logs the memory fallback as an error in production, where per-instance caps are not real caps", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createGuardLimits(DEFAULT_GUARD_CONFIG, { VERCEL_ENV: "production" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"rate_limit_memory_fallback"'));
    createGuardLimits(DEFAULT_GUARD_CONFIG, {});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"rate_limit_memory_fallback"'));
    vi.restoreAllMocks();
  });

  it("fails open, and logs it, when Redis does not answer within the timeout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const never = () => new Promise<never>(() => {});
    const hangingRedis = { evalsha: never, eval: never } as unknown as Parameters<typeof createUpstashLimiter>[0];
    const limiter = createUpstashLimiter(hangingRedis, { limit: 1, window: "1 m", prefix: "test", sliding: false, timeoutMs: 20 });
    const started = Date.now();
    expect(await limiter.limit("k")).toMatchObject({ success: true });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"rate_limit_timeout"'));
    vi.restoreAllMocks();
  });
});
