// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MARKDOWN = "@/components/chat/assistant-markdown";

beforeEach(() => vi.resetModules());
afterEach(() => {
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
    // React logs the caught render error; silence it so the run stays clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { AssistantText } = await import("@/components/chat/assistant-text");
    const { container } = render(
      <div>
        <p>resto de la pagina</p>
        <AssistantText text="hola <b>negrita</b>" streaming={false} />
      </div>,
    );
    await waitFor(() => expect(factory).toHaveBeenCalled());
    // Let the rejection reach React before asserting what survives.
    await new Promise((r) => setTimeout(r, 50));
    const fallback = await screen.findByText("hola <b>negrita</b>");
    expect(fallback.hasAttribute("data-markdown-fallback")).toBe(true);
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("resto de la pagina")).toBeTruthy();
  });

  it("upgrades a later message to markdown once the import works again", async () => {
    let healthy = false;
    vi.doMock(MARKDOWN, () => {
      if (!healthy) throw new Error("offline");
      return { default: ({ text }: { text: string }) => <div data-testid="md">{text}</div> };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { AssistantText } = await import("@/components/chat/assistant-text");
    const first = render(<AssistantText text="uno" streaming={false} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(first.container.querySelector("[data-markdown-fallback]")?.textContent).toBe("uno");
    first.unmount();
    healthy = true;
    render(<AssistantText text="dos" streaming={false} />);
    expect(await screen.findByTestId("md")).toBeTruthy();
  });

  it("shows the text escaped while the renderer is still loading", async () => {
    vi.doMock(MARKDOWN, () => new Promise(() => {}).then(() => ({ default: () => null })));
    const { AssistantText } = await import("@/components/chat/assistant-text");
    const { container } = render(<AssistantText text={"<script>alert(1)</script> hola"} streaming />);
    const fallback = container.querySelector("[data-markdown-fallback]");
    expect(fallback?.textContent).toBe("<script>alert(1)</script> hola");
    expect(container.querySelector("script")).toBeNull();
  });

  it("preloadAssistantText starts the import and swallows a failure", async () => {
    const factory = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.doMock(MARKDOWN, factory);
    const { preloadAssistantText } = await import("@/components/chat/assistant-text");
    preloadAssistantText();
    await waitFor(() => expect(factory).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
  });
});
