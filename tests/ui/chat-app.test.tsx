// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerDock } from "@/components/chat/composer-dock";
import type { ChatFailure } from "@/components/chat/error-notice";

const chat = vi.hoisted(() => ({ state: { messages: [] as unknown[], status: "ready" } }));
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chat.state.messages,
    status: chat.state.status,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    regenerate: vi.fn(),
    setMessages: vi.fn(),
    clearError: vi.fn(),
  }),
}));

import { ChatApp } from "@/components/chat/chat-app";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  chat.state = { messages: [], status: "ready" };
});

const dock = (failure: ChatFailure | null, failureId = 1) => (
  <ComposerDock failure={failure} failureId={failureId} busy={false} onSend={() => {}} onStop={() => {}} onRetry={() => {}} onRestart={() => {}} />
);
const box = () => screen.getByLabelText("Describe tu proyecto") as HTMLTextAreaElement;

describe("ComposerDock", () => {
  it("locks the input during a rate limit countdown and gives focus back when it ends", () => {
    const failure: ChatFailure = { view: { kind: "rate_limited", retryAfter: 5 }, retryAt: Date.now() + 5_000 };
    render(dock(failure));
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toContain("Podrás escribir de nuevo en");
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(box().disabled).toBe(false);
    expect(document.activeElement).toBe(box());
  });

  it("locks for quota_exhausted and bot_detected, but not for a model error", () => {
    const quota: ChatFailure = { view: { kind: "quota_exhausted", retryAfter: 60 }, retryAt: Date.now() + 60_000 };
    const { rerender } = render(dock(quota));
    expect(box().disabled).toBe(true);
    rerender(dock({ view: { kind: "bot_detected", retryAfter: null }, retryAt: null }, 2));
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toContain("Recarga la página");
    rerender(dock({ view: { kind: "model_error", retryAfter: null }, retryAt: null }, 3));
    expect(box().disabled).toBe(false);
  });

  it("remounts the error notice for every new failure so the alert is announced again", () => {
    const failure: ChatFailure = { view: { kind: "model_error", retryAfter: null }, retryAt: null };
    const { rerender } = render(dock(failure, 1));
    const first = screen.getByRole("alert");
    rerender(dock(failure, 1));
    expect(screen.getByRole("alert")).toBe(first);
    rerender(dock({ ...failure }, 2));
    expect(screen.getByRole("alert")).not.toBe(first);
  });
});

describe("ChatApp", () => {
  it("keeps the log silent per token and announces one summary when the turn settles", () => {
    chat.state = { messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hola" }] }], status: "streaming" };
    const { rerender } = render(<ChatApp />);
    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("off");
    expect(log.getAttribute("aria-busy")).toBe("true");
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("El asesor está trabajando.");
    chat.state = { ...chat.state, status: "ready" };
    rerender(<ChatApp />);
    expect(screen.getByRole("status").textContent).toBe("Respuesta lista.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Asesor Corona");
  });
});
