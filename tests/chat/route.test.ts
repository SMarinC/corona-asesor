import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("botid/server", () => ({ checkBotId: vi.fn(async () => ({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: true })) }));
const createDeps = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chat/production", () => ({ createProductionChatDeps: createDeps }));

afterEach(() => vi.restoreAllMocks());

describe("app/api/chat/route", () => {
  it("exports a Node.js POST handler with a bounded duration", async () => {
    const route = await import("@/app/api/chat/route");
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(60);
    expect(typeof route.POST).toBe("function");
  });

  it("answers a structured model_error, and retries the start next time, when the deps fail to build", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    createDeps.mockRejectedValueOnce(new Error("catalog missing"));
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{}" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("model_error");
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"chat_deps_unavailable"'));
    createDeps.mockRejectedValueOnce(new Error("still missing"));
    await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{}" }));
    expect(createDeps).toHaveBeenCalledTimes(2);
  });
});
