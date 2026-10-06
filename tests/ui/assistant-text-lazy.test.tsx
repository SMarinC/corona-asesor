// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MARKDOWN = "@/components/chat/assistant-markdown";

/** Catches anything the component under test lets escape, standing in for the rest of the page. */
class PageBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };
  static getDerivedStateFromError() {
    return { caught: true };
  }
  render() {
    return this.state.caught ? <p>PAGINA CAIDA</p> : this.props.children;
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Waits for the import and its retry to have run, then lets React surface the rejection. React retries a suspended
 * lazy on its own schedule and a failure lands about 100 ms after the retry, so a short wait would assert too early.
 */
async function settle(factory: { mock: { calls: unknown[] } }) {
  await vi.waitFor(() => expect(factory.mock.calls.length).toBeGreaterThanOrEqual(2));
  for (let i = 0; i < 3; i++) await tick(0);
  await tick(400);
}

let windowErrors: unknown[];
let unhandled: unknown[];
const onWindowError = (event: Event) => {
  event.preventDefault();
  windowErrors.push(event);
};
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  vi.resetModules();
  windowErrors = [];
  unhandled = [];
  window.addEventListener("error", onWindowError);
  process.on("unhandledRejection", onUnhandled);
  // React logs the render error it hands to a boundary; keep the run quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  window.removeEventListener("error", onWindowError);
  process.off("unhandledRejection", onUnhandled);
  cleanup();
  vi.doUnmock(MARKDOWN);
  vi.restoreAllMocks();
});

describe("AssistantText lazy loading", () => {
  it("degrades to escaped plain text when the renderer fails to load, and keeps the rest of the page", async () => {
    const factory = vi.fn(() => {
      throw new Error("chunk failed");
    });
    vi.doMock(MARKDOWN, factory);
    const { AssistantText } = await import("@/components/chat/assistant-text");
    const { container } = render(
      <PageBoundary>
        <p>resto de la página</p>
        <AssistantText text="hola <b>negrita</b>" streaming={false} />
      </PageBoundary>,
    );
    await settle(factory);
    expect(screen.queryByText("PAGINA CAIDA")).toBeNull();
    expect(screen.getByText("resto de la página")).toBeTruthy();
    expect(container.querySelector("[data-markdown-fallback]")?.textContent).toBe("hola <b>negrita</b>");
    expect(container.querySelector("b")).toBeNull();
    expect(windowErrors).toEqual([]);
    expect(unhandled).toEqual([]);
  });

  it("upgrades a later message to markdown once the import works again", async () => {
    let healthy = false;
    const factory = vi.fn(() => {
      if (!healthy) throw new Error("offline");
      return { default: ({ text }: { text: string }) => <div data-testid="md">{text}</div> };
    });
    vi.doMock(MARKDOWN, factory);
    const { AssistantText } = await import("@/components/chat/assistant-text");
    const first = render(
      <PageBoundary>
        <AssistantText text="uno" streaming={false} />
      </PageBoundary>,
    );
    await settle(factory);
    expect(screen.queryByText("PAGINA CAIDA")).toBeNull();
    expect(first.container.querySelector("[data-markdown-fallback]")?.textContent).toBe("uno");
    first.unmount();
    healthy = true;
    render(<AssistantText text="dos" streaming={false} />);
    expect((await screen.findByTestId("md")).textContent).toBe("dos");
    expect(windowErrors).toEqual([]);
  });

  it("shows the text escaped while the renderer is still loading", async () => {
    vi.doMock(MARKDOWN, () => new Promise(() => {}).then(() => ({ default: () => null })));
    const { AssistantText } = await import("@/components/chat/assistant-text");
    const { container } = render(<AssistantText text={"<script>alert(1)</script> hola"} streaming />);
    const fallback = container.querySelector("[data-markdown-fallback]");
    expect(fallback?.textContent).toBe("<script>alert(1)</script> hola");
    expect(container.querySelector("script")).toBeNull();
  });

  it("preloadAssistantText starts the import and leaves no unhandled rejection when it fails", async () => {
    const factory = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.doMock(MARKDOWN, factory);
    const { preloadAssistantText } = await import("@/components/chat/assistant-text");
    preloadAssistantText();
    await waitFor(() => expect(factory).toHaveBeenCalled());
    // Node reports unhandled rejections after the microtask queue drains; give it a real tick.
    await tick(50);
    expect(unhandled).toEqual([]);
  });
});
