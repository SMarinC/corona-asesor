import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { errorResponse, streamErrorCode } from "@/lib/guard/errors";

const quotaError = () =>
  new APICallError({ message: "Resource exhausted", url: "https://generativelanguage.googleapis.com", requestBodyValues: {}, statusCode: 429, isRetryable: true });

describe("errorResponse", () => {
  it("returns a typed JSON body with a Spanish message and the right status", async () => {
    const res = errorResponse("invalid_input");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(body.error.code).toBe("invalid_input");
    expect(body.error.message).toMatch(/1\.000 caracteres/);
    // Shape and validation failures land here too, so the message also offers a fresh start.
    expect(body.error.message).toMatch(/conversación nueva/);
  });

  it("adds retryAfter to the body and the Retry-After header", async () => {
    const res = errorResponse("rate_limited", { retryAfter: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect((await res.json()).error).toMatchObject({ code: "rate_limited", retryAfter: 42 });
  });

  it("maps each code to its status", () => {
    expect(errorResponse("bot_detected").status).toBe(403);
    expect(errorResponse("quota_exhausted").status).toBe(429);
    expect(errorResponse("model_error").status).toBe(500);
  });
});

describe("streamErrorCode", () => {
  it("maps provider 429s to quota_exhausted, also when wrapped by retries", () => {
    expect(streamErrorCode(quotaError())).toBe("quota_exhausted");
    expect(streamErrorCode(new RetryError({ message: "failed", reason: "maxRetriesExceeded", errors: [quotaError()] }))).toBe("quota_exhausted");
  });

  it("maps everything else to model_error", () => {
    expect(streamErrorCode(new Error("boom"))).toBe("model_error");
  });
});
