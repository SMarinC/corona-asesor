import { describe, expect, it } from "vitest";
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
