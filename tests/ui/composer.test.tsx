// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "@/components/chat/composer";
import { ErrorNotice } from "@/components/chat/error-notice";

afterEach(cleanup);

const setup = (props: Partial<Parameters<typeof Composer>[0]> = {}) => {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(<Composer onSend={onSend} onStop={onStop} busy={false} blockedReason={null} {...props} />);
  return { onSend, onStop, box: screen.getByLabelText("Describe tu proyecto") as HTMLTextAreaElement };
};

describe("Composer", () => {
  it("sends trimmed text on Enter and clears the box", () => {
    const { onSend, box } = setup();
    fireEvent.change(box, { target: { value: "  Piso de baño de 3 x 2 m  " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Piso de baño de 3 x 2 m");
    expect(box.value).toBe("");
  });

  it("keeps Shift + Enter for a new line and never sends empty text", () => {
    const { onSend, box } = setup();
    fireEvent.change(box, { target: { value: "hola" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send while an IME composition is in progress", () => {
    const { onSend, box } = setup();
    fireEvent.change(box, { target: { value: "enchapar" } });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send while the asesor is working", () => {
    const { onSend, box } = setup({ busy: true });
    fireEvent.change(box, { target: { value: "hola" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("counts characters near the limit and blocks sending past 1.000", () => {
    const { onSend, box } = setup();
    fireEvent.change(box, { target: { value: "a".repeat(900) } });
    expect(screen.getByText("900 / 1.000 caracteres")).toBeTruthy();
    fireEvent.change(box, { target: { value: "a".repeat(1_001) } });
    expect(screen.getByText("1.001 / 1.000 caracteres")).toBeTruthy();
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "Enviar mensaje" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("offers Stop while the asesor works", () => {
    const { onStop } = setup({ busy: true });
    fireEvent.click(screen.getByRole("button", { name: "Detener la respuesta" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("disables the input and says why while blocked", () => {
    const { box } = setup({ blockedReason: "Podrás escribir de nuevo en 30 s" });
    expect(box.disabled).toBe(true);
    expect(box.placeholder).toBe("Podrás escribir de nuevo en 30 s");
  });
});

describe("Composer ids", () => {
  it("ties the label and the help text through generated ids, not fixed ones", () => {
    const { box } = setup();
    expect(box.id).not.toBe("composer");
    expect(box.getAttribute("aria-describedby")).not.toBe("composer-help");
    expect(document.getElementById(box.getAttribute("aria-describedby")!)).toBeTruthy();
    expect(screen.getByLabelText("Describe tu proyecto")).toBe(box);
  });
});

describe("ErrorNotice", () => {
  const noop = () => {};

  it("counts down a rate limit without offering a retry", () => {
    render(<ErrorNotice failure={{ view: { kind: "rate_limited", retryAfter: 30 }, retryAt: 0 }} remaining={12} onRetry={noop} onRestart={noop} />);
    expect(screen.getByRole("alert").textContent).toContain("Puedes escribir de nuevo en 12 s.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers the one action that helps for each error", () => {
    const onRetry = vi.fn();
    const onRestart = vi.fn();
    render(<ErrorNotice failure={{ view: { kind: "model_error", retryAfter: null }, retryAt: null }} remaining={null} onRetry={onRetry} onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
    cleanup();
    render(<ErrorNotice failure={{ view: { kind: "network", retryAfter: null }, retryAt: null }} remaining={null} onRetry={onRetry} onRestart={onRestart} />);
    expect(screen.getByRole("alert").textContent).toContain("No pudimos conectar con el servidor");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(2);
    cleanup();
    render(<ErrorNotice failure={{ view: { kind: "invalid_input", retryAfter: null }, retryAt: null }} remaining={null} onRetry={onRetry} onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: "Empezar de nuevo" }));
    expect(onRestart).toHaveBeenCalled();
    cleanup();
    render(<ErrorNotice failure={{ view: { kind: "bot_detected", retryAfter: null }, retryAt: null }} remaining={null} onRetry={onRetry} onRestart={onRestart} />);
    expect(screen.getByRole("button", { name: "Recargar la página" })).toBeTruthy();
  });

  it("offers no action once a quota wait is shown, and announces the wait only once", () => {
    render(<ErrorNotice failure={{ view: { kind: "quota_exhausted", retryAfter: 90 }, retryAt: 0 }} remaining={60} onRetry={noop} onRestart={noop} />);
    expect(screen.queryByRole("button")).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.querySelectorAll("[aria-hidden='true']:not(svg)").length).toBe(1);
    expect(alert.querySelector(".sr-only")?.textContent).toContain("1 min");
  });

  it("announces the time left when it mounts, not the server's original value", () => {
    render(<ErrorNotice failure={{ view: { kind: "rate_limited", retryAfter: 600 }, retryAt: 0 }} remaining={90} onRetry={noop} onRestart={noop} />);
    expect(screen.getByRole("alert").querySelector(".sr-only")?.textContent).toContain("2 min");
  });
});
