import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, hashIp } from "@/lib/guard/ip";

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip, then to unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("hashIp", () => {
  it("is stable, short and never contains the raw IP", () => {
    const hash = hashIp("203.0.113.7", "salt");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hashIp("203.0.113.7", "salt")).toBe(hash);
    expect(hashIp("203.0.113.8", "salt")).not.toBe(hash);
    expect(hash).not.toContain("203");
  });
});

describe("hashIp salt handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("differs per salt and is not the plain sha256 of the IP", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {}); // the empty salt warns
    const ip = "203.0.113.7";
    expect(hashIp(ip, "a")).not.toBe(hashIp(ip, "b"));
    const plain = createHash("sha256").update(ip).digest("hex");
    for (const salt of ["", "a"]) {
      const hash = hashIp(ip, salt);
      expect(hash, `salt "${salt}"`).not.toBe(plain);
      expect(hash, `salt "${salt}"`).not.toBe(plain.slice(0, 16));
    }
  });

  it("warns once per process when the salt is missing, as error in production", async () => {
    vi.resetModules();
    vi.stubEnv("IP_HASH_SALT", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = await import("@/lib/guard/ip");
    const a = fresh.hashIp("203.0.113.7");
    const b = fresh.hashIp("203.0.113.7");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({ event: "ip_hash_salt_missing" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns at warn level outside production", async () => {
    vi.resetModules();
    vi.stubEnv("IP_HASH_SALT", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = await import("@/lib/guard/ip");
    fresh.hashIp("1.2.3.4");
    fresh.hashIp("1.2.3.5");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when a salt is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hashIp("1.2.3.4", "salt");
    expect(warn).not.toHaveBeenCalled();
  });
});
