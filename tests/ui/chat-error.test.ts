import { APICallError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResponse } from "@/lib/guard/errors";
import { chatErrorCopy, chatFetch, MIN_RETRY_SECONDS, parseChatError } from "@/lib/ui/chat-error";

/** What useChat throws when the route rejects the request before streaming. */
async function rejected(code: Parameters<typeof errorResponse>[0], retryAfter?: number) {
  const response = errorResponse(code, { retryAfter });
  const responseBody = await response.text();
  return new APICallError({ message: responseBody, url: "/api/chat", requestBodyValues: undefined, statusCode: response.status, responseBody });
}

describe("parseChatError", () => {
  it("reads the code and retryAfter from a rejected request", async () => {
    expect(parseChatError(await rejected("quota_exhausted", 3600))).toEqual({ kind: "quota_exhausted", retryAfter: 3600 });
    expect(parseChatError(await rejected("bot_detected"))).toEqual({ kind: "bot_detected", retryAfter: null });
    expect(parseChatError(await rejected("invalid_input"))).toEqual({ kind: "invalid_input", retryAfter: null });
  });

  it("never lets a rate limit re-enable the input sooner than the floor", async () => {
    expect(parseChatError(await rejected("rate_limited", 1))).toEqual({ kind: "rate_limited", retryAfter: MIN_RETRY_SECONDS });
    expect(parseChatError(await rejected("rate_limited", 120))).toEqual({ kind: "rate_limited", retryAfter: 120 });
  });

  it("reads the code from a mid-stream error chunk", () => {
    expect(parseChatError(new Error("quota_exhausted"))).toEqual({ kind: "quota_exhausted", retryAfter: null });
    expect(parseChatError(new Error("model_error"))).toEqual({ kind: "model_error", retryAfter: null });
  });

  it("covers blockers in the network copy", () => {
    expect(chatErrorCopy({ kind: "network", retryAfter: null }, null)).toBe(
      "No pudimos conectar con el servidor. Revisa tu conexión o desactiva bloqueadores para este sitio, y reintenta.",
    );
  });

  it("separates network failures from model errors", () => {
    expect(parseChatError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(parseChatError(new Error("something else")).kind).toBe("model_error");
    expect(parseChatError({ responseBody: "<html>502</html>" }).kind).toBe("model_error");
  });
});

describe("chatErrorCopy", () => {
  it("states the wait while it runs and the recovery after", () => {
    expect(chatErrorCopy({ kind: "rate_limited", retryAfter: 30 }, 30)).toBe(
      "Enviaste varios mensajes seguidos. Puedes escribir de nuevo en 30 s.",
    );
    expect(chatErrorCopy({ kind: "rate_limited", retryAfter: 30 }, 0)).toBe("Ya puedes escribir de nuevo.");
    expect(chatErrorCopy({ kind: "quota_exhausted", retryAfter: null }, null)).toContain("más tarde");
    expect(chatErrorCopy({ kind: "invalid_input", retryAfter: null }, null)).toContain("conversación nueva");
  });
});

describe("chatFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns a non-Error rejection (BotID's failed script load) into a network error useChat reports", async () => {
    // useChat only calls onError for Error instances; BotID rejects with the script's error Event when the
    // server is unreachable, which left the visitor with no notice at all.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Event("error"))));
    const error = await chatFetch("/api/chat", { method: "POST" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(parseChatError(error).kind).toBe("network");
  });

  it("passes responses and Error rejections, aborts included, through untouched", async () => {
    const response = new Response("{}");
    vi.stubGlobal("fetch", vi.fn(async () => response));
    expect(await chatFetch("/api/chat")).toBe(response);

    const abort = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(abort)));
    expect(await chatFetch("/api/chat").catch((e: unknown) => e)).toBe(abort);
  });
});
