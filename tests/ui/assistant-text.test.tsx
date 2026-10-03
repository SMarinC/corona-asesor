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

  it("never renders a half-typed citation as a live link while streaming", () => {
    render(
      <CitationsProvider ids={[]}>
        <AssistantText text="cerámica [c00" streaming />
      </CitationsProvider>,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("uses noopener on external links", async () => {
    render(
      <CitationsProvider ids={[]}>
        <AssistantText text="Mira [la ficha](https://example.com/ficha)." streaming={false} />
      </CitationsProvider>,
    );
    const link = await screen.findByRole("link", { name: "la ficha" });
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.className).toContain("wrap-anywhere");
  });

  it("drops images the model writes", () => {
    const { container } = render(
      <CitationsProvider ids={[]}>
        <AssistantText text="Mira ![pixel](https://tracker.example/p.png) y <img src='https://tracker.example/q.png'>" streaming={false} />
      </CitationsProvider>,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
