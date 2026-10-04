import { renderToBuffer } from "@react-pdf/renderer";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { QuotePdf } from "@/components/project/quote-pdf";
import { deriveProject } from "@/lib/ui/derive-project";
import { DISCLAIMER_SHORT } from "@/lib/ui/legal";
import { bathroomConversation } from "../fixtures/ui-messages";
import { laterRecalculation, withCheckedTile } from "../fixtures/project-variants";

/** react-pdf compresses its output, so content is asserted on the element tree it is given. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return `${textOf(node.props.children)}\n`;
  return "";
}

const at = new Date("2026-10-02T12:00:00Z");
const pdfTextFor = (messages: ReturnType<typeof bathroomConversation>) =>
  textOf(QuotePdf({ project: deriveProject(messages), logoSrc: null, generatedAt: at }));

describe("QuotePdf", () => {
  it("never splits a word across text children, so a SKU in parentheses cannot wrap as a negative number", () => {
    // react-pdf lays out each text child as its own run and may break between two runs that touch, adding a hyphen:
    // "({line.sku})" printed "(-" at the end of one line and "555332501)" on the next.
    const glued: string[] = [];
    function walk(node: ReactNode): void {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!isValidElement<{ children?: ReactNode }>(node)) return;
      // Expand our own components (react-pdf primitives are plain strings) to check what react-pdf receives.
      if (typeof node.type === "function") return walk((node.type as (props: object) => ReactNode)(node.props));
      const children = ([] as ReactNode[]).concat(node.props.children ?? []).filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
      for (let i = 0; i + 1 < children.length; i++) {
        const [a, b] = [children[i], children[i + 1]];
        const prim = (c: ReactNode) => typeof c === "string" || typeof c === "number";
        if (prim(a) && prim(b) && !/\s$/.test(String(a)) && !/^\s/.test(String(b))) glued.push(`${a}|${b}`);
      }
      children.forEach(walk);
    }
    for (const messages of [bathroomConversation(), withCheckedTile({ sku: "T2", name: "Piso Prueba Gris 45x45" })]) {
      walk(QuotePdf({ project: deriveProject(messages), logoSrc: null, generatedAt: at }));
    }
    expect(glued).toEqual([]);
  });

  it("prints the budget line in the brand blue only when the quote is clean", () => {
    /** The color of the Text element that carries the budget sentence. */
    function budgetColor(node: ReactNode): string | undefined {
      if (Array.isArray(node)) return node.map(budgetColor).find(Boolean);
      if (!isValidElement<{ children?: ReactNode; style?: { color?: string } }>(node)) return undefined;
      const own = node.props.style?.color;
      if (own && /^Dentro del presupuesto/.test(textOf(node.props.children))) return own;
      return budgetColor(node.props.children);
    }
    const colorFor = (messages: ReturnType<typeof bathroomConversation>) =>
      budgetColor(QuotePdf({ project: deriveProject(messages), logoSrc: null, generatedAt: at }));
    expect(colorFor(bathroomConversation())).toBe("#005EB8");
    expect(colorFor(laterRecalculation())).toBe("#526173");
    expect(colorFor(bathroomConversation({ quoteLines: [{ sku: "T1", quantity: 5 }, { sku: "G2", quantity: 3 }] }))).toBe("#526173");
  });

  it("renders the quote to a PDF document", async () => {
    const project = deriveProject(bathroomConversation());
    const buffer = await renderToBuffer(<QuotePdf project={project} logoSrc={null} generatedAt={at} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2_000);
  });

  it("renders a quote that needs review without throwing", async () => {
    const project = deriveProject(bathroomConversation({ quoteLines: [{ sku: "T4", quantity: 2 }] }));
    const buffer = await renderToBuffer(<QuotePdf project={project} logoSrc={null} generatedAt={new Date()} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("labels each price per caja, bulto and unidad, and carries the disclaimer", () => {
    const text = pdfTextFor(bathroomConversation());
    expect(text).toContain("$80.000 por caja");
    expect(text).toMatch(/por bulto/);
    expect(text).toMatch(/por unidad/);
    expect(text).toContain(DISCLAIMER_SHORT);
    expect(text).not.toMatch(/Requiere revisión/);
  });

  it("states the legal points the footer must make, without crediting any AI", () => {
    for (const phrase of ["AgentSprint by ReshapeX", "información pública", "propuesta de mejora", "Organización Corona"]) {
      expect(DISCLAIMER_SHORT).toContain(phrase);
    }
    expect(DISCLAIMER_SHORT).not.toMatch(/Claude|Anthropic|Gemini|inteligencia artificial/i);
  });

  it("flags a stale quote as needing review and lists the review items in the project order", () => {
    const messages = laterRecalculation();
    const text = pdfTextFor(messages);
    expect(text).toContain("Requiere revisión");
    const reasons = deriveProject(messages).review.map((r) => r.reason);
    expect(reasons.length).toBeGreaterThan(0);
    let from = text.indexOf("Requiere revisión");
    for (const reason of reasons) {
      const found = text.indexOf(reason, from);
      expect(found).toBeGreaterThanOrEqual(from);
      from = found;
    }
  });

  it("names both tiles when the compatibility check used another one", () => {
    const text = pdfTextFor(withCheckedTile({ sku: "T3", name: "Piso Exterior Terracota 45x45" }));
    expect(text).toContain("Calculado para Piso Prueba Blanco 60x60 (T1)");
    expect(text).toContain("Piso Exterior Terracota 45x45 (T3)");
  });

  it("never emits characters Helvetica cannot encode", () => {
    expect(pdfTextFor(bathroomConversation())).not.toContain("↔");
  });
});
