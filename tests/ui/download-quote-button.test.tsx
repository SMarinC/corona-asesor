// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadQuoteButton } from "@/components/project/download-quote-button";
import { deriveProject } from "@/lib/ui/derive-project";
import { bathroomConversation } from "../fixtures/ui-messages";

vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: async () => new Blob(["x"]) }) }));
vi.mock("@/components/project/quote-pdf", () => ({ QuotePdf: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DownloadQuoteButton", () => {
  it("revokes the object URL after a delay, not synchronously after the click", async () => {
    render(<DownloadQuoteButton project={deriveProject(bathroomConversation())} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar cotización en PDF" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
