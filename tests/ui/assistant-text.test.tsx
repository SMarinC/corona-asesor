// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantText } from "@/components/chat/assistant-text";
import { CitationsProvider } from "@/components/chat/citations-context";

afterEach(cleanup);

describe("AssistantText", () => {
  it("renders markdown and turns cited ids into chips, flagging ids no tool returned", async () => {
    render(
      <CitationsProvider ids={["c0046"]}>
        <AssistantText text={"El pegante sirve para cerámica [c0046] y la boquilla para juntas de 1 a 5 mm [c0999].\n\n- **Total:** $330.012"} streaming={false} />
      </CitationsProvider>,
    );
    expect(await screen.findByRole("button", { name: "Ver la cita c0046 de la ficha técnica" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cita c0999 no verificada: ninguna herramienta la devolvió" })).toBeTruthy();
    expect(screen.getByText("Total:").dataset.streamdown).toBe("strong");
  });

  it("opens external links in a new tab without a referrer", async () => {
    render(
      <CitationsProvider ids={[]}>
        <AssistantText text="Mira [la ficha](https://example.com/ficha)." streaming={false} />
      </CitationsProvider>,
    );
    const link = await screen.findByRole("link", { name: "la ficha" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });
});
