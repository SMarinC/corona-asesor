// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CitationChip, resetFragmentCache } from "@/components/tools/citation-chip";
import { citationIdsIn } from "@/lib/ui/citations";
import type { CitationFragment } from "@/lib/ui/citation-fragment";

const fragment: CitationFragment = {
  citationId: "c0001",
  section: "Aplicación",
  docType: "adhesive",
  skus: ["A1", "A2"],
  skuCount: 14,
  skusTruncated: true,
  text: "Apto para cerámica.",
  truncated: false,
};

beforeEach(resetFragmentCache);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function open(id: string, verified = true) {
  render(<CitationChip id={id} verified={verified} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(id) }));
  });
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("CitationChip popover", () => {
  it("shows the fragment and 'y N más' when the SKU list was truncated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fragment), { status: 200 })));
    await open("c0001");
    expect(await screen.findByText("Apto para cerámica.")).toBeTruthy();
    expect(screen.getByText(/SKU A1, A2 y 12 más/)).toBeTruthy();
  });

  it("never parses a non-OK body: Next's static 404 HTML becomes 'Fragmento no disponible'", async () => {
    const json = vi.fn(() => Promise.reject(new SyntaxError("Unexpected token <")));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json, text: async () => "<html>404</html>" })));
    await open("c0002");
    expect(await screen.findByText(/Fragmento no disponible/)).toBeTruthy();
    expect(json).not.toHaveBeenCalled();
  });

  it("falls back to 'No se pudo cargar' on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await open("c0003");
    expect(await screen.findByText(/No se pudo cargar el fragmento c0003/)).toBeTruthy();
  });

  it("requests each id once", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fragment), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await open("c0004");
    await screen.findByText("Apto para cerámica.");
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /c0004/ }));
    });
    await screen.findByText("Apto para cerámica.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks an unverified chip and says so in the popover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await open("c0005", false);
    expect(screen.getByRole("button", { name: "Cita c0005 no verificada: ninguna herramienta la devolvió" })).toBeTruthy();
    expect(await screen.findByText(/Tómala como no verificada/)).toBeTruthy();
  });
});

describe("CitationChip failures and semantics", () => {
  it("keeps showing the error of a slow network failure and does not refetch while open", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>((_, reject) => setTimeout(() => reject(new TypeError("offline")), 60)));
    vi.stubGlobal("fetch", fetchMock);
    await open("c0010");
    expect(await screen.findByText(/No se pudo cargar el fragmento c0010/, {}, { timeout: 2000 })).toBeTruthy();
    await act(async () => {
      await wait(150);
    });
    expect(screen.getByText(/No se pudo cargar el fragmento c0010/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on Reintentar and when the popover is closed and opened again", async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new TypeError("offline")));
    vi.stubGlobal("fetch", fetchMock);
    await open("c0011");
    await screen.findByText(/No se pudo cargar el fragmento c0011/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    await screen.findByText(/No se pudo cargar el fragmento c0011/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /c0011/ }));
    });
    await screen.findByText(/No se pudo cargar el fragmento c0011/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("says the citation is not in the sheets only for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 404 })));
    await open("c0012");
    expect(await screen.findByText(/La cita c0012 no está en las fichas técnicas/)).toBeTruthy();
  });

  it("uses neutral copy for other statuses and for a non-JSON 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    await open("c0013");
    expect(await screen.findByText("Fragmento no disponible por ahora.")).toBeTruthy();
    expect(screen.queryByText(/no está en las fichas/)).toBeNull();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 200 })));
    await open("c0014");
    expect(await screen.findByText("Fragmento no disponible por ahora.")).toBeTruthy();
  });

  it("names the popover and makes the scrollable fragment focusable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fragment), { status: 200 })));
    await open("c0015");
    expect(screen.getByRole("dialog", { name: "Cita c0015" })).toBeTruthy();
    const text = await screen.findByText("Apto para cerámica.");
    expect(text.getAttribute("tabindex")).toBe("0");
  });
});

describe("verified ids", () => {
  it("excludes ids a tool rejected", () => {
    const ids = citationIdsIn({ data: { adhesive: { citationId: "c0001" }, rejectedOverrides: [{ citationId: "c0999" }] } });
    expect(ids).toEqual(["c0001"]);
  });
});
