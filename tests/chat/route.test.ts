import { describe, expect, it, vi } from "vitest";

vi.mock("botid/server", () => ({ checkBotId: vi.fn(async () => ({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: true })) }));

describe("app/api/chat/route", () => {
  it("exports a Node.js POST handler with a bounded duration", async () => {
    const route = await import("@/app/api/chat/route");
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(60);
    expect(typeof route.POST).toBe("function");
  });
});
