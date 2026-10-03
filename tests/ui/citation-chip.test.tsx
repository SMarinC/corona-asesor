// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  fireEvent.click(screen.getByRole("button"));
}

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
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /c0004/ }));
    await screen.findByText("Apto para cerámica.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks an unverified chip and says so in the popover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await open("c0005", false);
    expect(screen.getByRole("button", { name: "La cita c0005 no viene de ninguna herramienta" })).toBeTruthy();
    expect(await screen.findByText(/Tómala como no verificada/)).toBeTruthy();
  });
});

describe("verified ids", () => {
  it("excludes ids a tool rejected", () => {
    const ids = citationIdsIn({ data: { adhesive: { citationId: "c0001" }, rejectedOverrides: [{ citationId: "c0999" }] } });
    expect(ids).toEqual(["c0001"]);
  });
});
