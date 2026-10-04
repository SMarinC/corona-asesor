import { Document, Image, Page, StyleSheet, Text, type TextProps, View } from "@react-pdf/renderer";
import { Children, type ReactNode } from "react";
import type { ProjectState } from "@/lib/ui/derive-project";
import { formatCOP, formatM2, formatQuantity } from "@/lib/ui/format";
import { DISCLAIMER_SHORT } from "@/lib/ui/legal";
import { needsReview, pdfText, tileMismatch } from "@/lib/ui/project-view";

/** Joins touching string and number children into one string; nested elements stay as they are. */
export function joinText(children: ReactNode): ReactNode {
  const out: ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    const last = out.at(-1);
    if ((typeof child === "string" || typeof child === "number") && typeof last === "string") out[out.length - 1] = last + String(child);
    else out.push(typeof child === "number" ? String(child) : child);
  }
  return out.length === 1 ? out[0] : out;
}

/**
 * react-pdf lays out every text child as its own run and may break a line where two runs touch, adding a hyphen:
 * "({sku})" printed "(-" at the end of a line and "555332501)" on the next, which reads as a negative SKU.
 * All text goes through here so lines only break at spaces.
 */
function PdfText({ children, ...props }: TextProps & { children?: ReactNode }) {
  return <Text {...props}>{joinText(children)}</Text>;
}

const BLUE = "#005EB8";
const INK = "#0F1B2D";
const MUTED = "#526173";
const RULE = "#D9E1E8";
const REVIEW = "#A14D06";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 72, paddingHorizontal: 44, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  logo: { width: 30, height: 30 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  muted: { color: MUTED },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 5 },
  headRow: { flexDirection: "row", paddingBottom: 4, color: MUTED, fontSize: 9 },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 70, textAlign: "right" },
  colPrice: { width: 110, textAlign: "right" },
  colTotal: { width: 76, textAlign: "right" },
  totalRow: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: INK, paddingTop: 6, marginTop: 2 },
  totalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 12 },
  totalValue: { width: 160, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 12 },
  review: { color: REVIEW },
  footer: { position: "absolute", left: 44, right: 44, bottom: 28, fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 6 },
});

const VERDICT_ES = { compatible: "Compatible", needs_review: "Requiere revisión", incompatible: "Incompatible" } as const;

export interface QuotePdfProps {
  project: ProjectState;
  /** Absolute URL or data URI of the logo; react-pdf cannot resolve site-relative paths. */
  logoSrc: string | null;
  generatedAt: Date;
}

/** The quote as a document the visitor can keep: only tool outputs, plus the disclaimer on every page. */
export function QuotePdf({ project, logoSrc, generatedAt }: QuotePdfProps) {
  const quote = project.quote;
  const lines = quote?.data.lines ?? [];
  const date = new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(generatedAt);
  // Same rule and same list as the panel: a stale quote or any review item means the quote is not clean.
  const flagged = needsReview(project);
  const mismatch = tileMismatch(project);
  const laidTile = project.materials?.tile ?? null;
  return (
    <Document title="Cotización de materiales (demo académica)" author="Asesor Corona (demo académica)" language="es">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the PDF title names the document. */}
          {logoSrc && <Image src={logoSrc} style={s.logo} />}
          <View>
            <PdfText style={s.title}>Cotización de materiales</PdfText>
            <PdfText style={s.subtitle}>Asesor Corona, demo académica. Generada el {date}.</PdfText>
          </View>
        </View>

        {flagged && <PdfText style={[s.review, { marginBottom: 8, fontFamily: "Helvetica-Bold" }]}>Requiere revisión: ver el detalle al final de la cotización.</PdfText>}
        {quote?.data.projectSummary && <PdfText>{pdfText(quote.data.projectSummary)}</PdfText>}
        {project.space && (
          <PdfText style={s.muted}>
            Área {formatM2(project.space.areaM2)}, {formatM2(project.space.areaWithWasteM2)} con desperdicio.
          </PdfText>
        )}
        {laidTile && (
          <PdfText style={s.muted}>
            Calculado para {pdfText(laidTile.name)} ({laidTile.sku}).
          </PdfText>
        )}

        <PdfText style={s.h2}>Productos</PdfText>
        <View style={s.headRow}>
          <PdfText style={s.colName}>Producto</PdfText>
          <PdfText style={s.colQty}>Cantidad</PdfText>
          <PdfText style={s.colPrice}>Precio</PdfText>
          <PdfText style={s.colTotal}>Subtotal</PdfText>
        </View>
        {lines.map((line) => (
          <View key={line.sku} style={[s.row, quote?.lineChecks[line.sku] !== "computed" ? s.review : {}]}>
            <PdfText style={s.colName}>
              {pdfText(line.name)} <PdfText style={s.muted}>({line.sku})</PdfText>
            </PdfText>
            <PdfText style={s.colQty}>{formatQuantity(line.quantity, line.unit)}</PdfText>
            <PdfText style={s.colPrice}>{line.unitPrice === null ? "Sin precio" : `${formatCOP(line.unitPrice)} por ${line.unit}`}</PdfText>
            <PdfText style={s.colTotal}>{line.subtotal === null ? "Sin precio" : formatCOP(line.subtotal)}</PdfText>
          </View>
        ))}
        <View style={s.totalRow}>
          <PdfText style={s.totalLabel}>Total{flagged ? " (requiere revisión)" : ""}</PdfText>
          <PdfText style={s.totalValue}>{formatCOP(quote?.data.total ?? 0)}</PdfText>
        </View>
        {quote?.data.budget != null && (
          <PdfText style={{ marginTop: 6, color: quote.data.withinBudget !== true ? REVIEW : flagged ? MUTED : BLUE }}>
            {quote.data.withinBudget === true && `Dentro del presupuesto de ${formatCOP(quote.data.budget)}.`}
            {quote.data.withinBudget === false && `Supera el presupuesto de ${formatCOP(quote.data.budget)} por ${formatCOP(-(quote.data.difference ?? 0))}.`}
            {quote.data.withinBudget == null && `Presupuesto de ${formatCOP(quote.data.budget)}: requiere revisión.`}
          </PdfText>
        )}

        {project.compatibility && (
          <>
            <PdfText style={s.h2}>Compatibilidad: {VERDICT_ES[project.compatibility.verdict]}</PdfText>
            {mismatch && (
              <PdfText style={[s.review, { marginBottom: 4 }]}>
                Se verificó con {pdfText(mismatch.checked.name)} ({mismatch.checked.sku}), otro revestimiento distinto al de los materiales.
              </PdfText>
            )}
            {project.compatibility.checks.map((check) => (
              <PdfText key={check.rule} style={{ marginBottom: 2 }}>
                {pdfText(check.rule)}: {pdfText(check.message)}
                {check.citationId ? ` [${check.citationId}]` : ""}
              </PdfText>
            ))}
          </>
        )}

        {project.review.length > 0 && (
          <>
            <PdfText style={s.h2}>Requiere revisión</PdfText>
            {project.review.map((item) => (
              <PdfText key={`${item.tool}-${item.field}`} style={[s.review, { marginBottom: 2 }]}>
                {pdfText(item.reason)}
              </PdfText>
            ))}
          </>
        )}

        {project.citations.length > 0 && (
          <PdfText style={[s.muted, { marginTop: 12, fontSize: 8.5 }]}>Fragmentos de fichas técnicas citados: {project.citations.join(", ")}.</PdfText>
        )}
        {quote?.data.priceNote && <PdfText style={[s.muted, { marginTop: 4, fontSize: 8.5 }]}>{pdfText(quote.data.priceNote)}</PdfText>}

        <PdfText style={s.footer} fixed>
          {DISCLAIMER_SHORT}
        </PdfText>
      </Page>
    </Document>
  );
}
