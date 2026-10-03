// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/chat/site-header";
import { CREDITS, DATA_USE_NOTE, DISCLAIMER, DISCLAIMER_SHORT } from "@/lib/ui/legal";

afterEach(cleanup);

describe("disclaimer", () => {
  it("opens from the header chip with the academic, public-data, proposal and ownership statements", async () => {
    render(<SiteHeader onRestart={() => {}} canRestart={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Demo académica" }));
    const dialog = await screen.findByRole("dialog", { name: "Sobre esta demo" });
    const text = dialog.textContent ?? "";
    for (const phrase of ["AgentSprint by ReshapeX", "información pública", "No se usó información privilegiada", "propuesta de mejora", "pertenecen a Organización Corona", "no está afiliado"]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text).toContain("Daniel Garzón, Juan Miranda y Santiago Marín");
    expect(text).toContain("nivel gratuito de la API de Gemini");
    expect(text).toContain("(se abre en una pestaña nueva)");
  });

  it("names the team and the rewrite author only, with no AI-assistant attribution", () => {
    const all = [...DISCLAIMER, DATA_USE_NOTE, CREDITS, DISCLAIMER_SHORT].join(" ");
    expect(all).not.toMatch(/claude|anthropic|chatgpt|copilot/i);
  });
});
