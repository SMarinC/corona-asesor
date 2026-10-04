// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerDock } from "@/components/chat/composer-dock";
import type { ChatFailure } from "@/components/chat/error-notice";

const chat = vi.hoisted(() => ({
  state: { messages: [] as unknown[], status: "ready" },
  options: undefined as undefined | { onError: (e: unknown) => void },
  sendMessage: undefined as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { onError: (e: unknown) => void }) => ({
    ...((chat.options = opts), {}),
    messages: chat.state.messages,
    status: chat.state.status,
    sendMessage: chat.sendMessage,
    stop: vi.fn(),
    regenerate: vi.fn(),
    setMessages: vi.fn(),
    clearError: vi.fn(),
  }),
}));

import { ChatApp, prepareChatRequest } from "@/components/chat/chat-app";
import { MAX_HISTORY_BYTES } from "@/lib/guard/limits";

beforeEach(() => {
  chat.sendMessage = vi.fn();
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

  it("does not steal focus from another element when the lock lifts", () => {
    const failure: ChatFailure = { view: { kind: "rate_limited", retryAfter: 5 }, retryAt: Date.now() + 5_000 };
    render(
      <>
        <button type="button">Otro</button>
        {dock(failure)}
      </>,
    );
    const other = screen.getByRole("button", { name: "Otro" });
    other.focus();
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(box().disabled).toBe(false);
    expect(document.activeElement).toBe(other);
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

const fail = (body: unknown) => act(() => chat.options?.onError(Object.assign(new Error("Request failed"), { responseBody: JSON.stringify(body) })));
const rateLimited = { error: { code: "rate_limited", retryAfter: 5 } };
const userMsg = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] });

describe("ChatApp", () => {
  it("keeps the log silent per token and announces one summary when the turn settles", () => {
    chat.state = { messages: [userMsg("m1", "hola")], status: "streaming" };
    const { rerender } = render(<ChatApp />);
    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("off");
    expect(log.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("El asesor está trabajando.");
    chat.state = { ...chat.state, status: "ready" };
    rerender(<ChatApp />);
    expect(screen.getByRole("status").textContent).toBe("Respuesta lista.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Asesor Corona");
  });

  it("says the response was stopped, not ready, after Stop", () => {
    chat.state = { messages: [userMsg("m1", "hola")], status: "streaming" };
    const { rerender } = render(<ChatApp />);
    fireEvent.click(screen.getByRole("button", { name: "Detener la respuesta" }));
    chat.state = { ...chat.state, status: "ready" };
    rerender(<ChatApp />);
    expect(screen.getByRole("status").textContent).toBe("Respuesta detenida.");
  });

  it("locks the composer on a rate-limit error and remounts the notice on a second failure", () => {
    render(<ChatApp />);
    fail(rateLimited);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Describe tu proyecto") as HTMLTextAreaElement).disabled).toBe(true);
    const first = screen.getByRole("alert");
    fail(rateLimited);
    expect(screen.getByRole("alert")).not.toBe(first);
  });

  it("clears the failure when a message is sent, and ignores sends while busy", () => {
    const { rerender } = render(<ChatApp />);
    fail({ error: { code: "model_error" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    const box = screen.getByLabelText("Describe tu proyecto");
    fireEvent.change(box, { target: { value: "piso de baño" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();

    chat.state = { messages: [], status: "streaming" };
    rerender(<ChatApp />);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.includes("Piso"))!);
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("disables suggestion chips during a wait and re-enables them when it ends", () => {
    render(<ChatApp />);
    fail(rateLimited);
    const chip = () => screen.getAllByRole("button").find((b) => b.textContent?.includes("Piso")) as HTMLButtonElement;
    expect(chip().disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(chip().disabled).toBe(false);
  });

  it("positions both scroll areas, so sr-only text inside them cannot stretch the page", () => {
    // An absolutely positioned sr-only node (the quote table caption) escapes an unpositioned scroller and adds
    // page-level scroll that drags the header away on short screens.
    render(<ChatApp />);
    expect(screen.getByRole("log").parentElement?.classList.contains("relative")).toBe(true);
    expect(screen.getByRole("complementary").classList.contains("relative")).toBe(true);
  });

  it("shows the empty state from its heading and sticks to the bottom only once there is a conversation", () => {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    const { rerender } = render(<ChatApp />);
    const scroller = screen.getByRole("log").parentElement as HTMLElement;
    let top = 0;
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => top, set: (v: number) => (top = v) });
    act(() => callbacks.forEach((cb) => cb()));
    expect(top).toBe(0);

    chat.state = { messages: [userMsg("m1", "hola")], status: "streaming" };
    rerender(<ChatApp />);
    act(() => callbacks.forEach((cb) => cb()));
    expect(top).toBe(900);

    chat.state = { messages: [], status: "ready" };
    rerender(<ChatApp />);
    expect(top).toBe(0);
  });
});

describe("prepareChatRequest", () => {
  it("sends the history the server would keep: under the byte budget, starting and ending with a user turn", () => {
    const big = "x".repeat(20_000);
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push(userMsg("u" + i, "pregunta " + i));
      messages.push({ id: "a" + i, role: "assistant", parts: [{ type: "tool-searchTechnicalSheets", state: "output-available", output: big }] });
    }
    messages.push(userMsg("last", "y la boquilla?"));
    expect(JSON.stringify(messages).length).toBeGreaterThan(MAX_HISTORY_BYTES);
    const { body } = prepareChatRequest!({ id: "c1", messages } as never) as { body: { id: string; messages: { id: string; role: string }[] } };
    expect(body.id).toBe("c1");
    expect(JSON.stringify(body.messages).length).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages.at(-1)?.id).toBe("last");
  });
});
