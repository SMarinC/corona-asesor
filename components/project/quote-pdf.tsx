import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ProjectState } from "@/lib/ui/derive-project";
import { formatCOP, formatM2, formatQuantity } from "@/lib/ui/format";
import { DISCLAIMER_SHORT } from "@/lib/ui/legal";
import { needsReview, pdfText, tileMismatch } from "@/lib/ui/project-view";

// The default hyphenation is English and splits digits too: "(555332501)" wrapped as "(-" + "555332501)", which
// reads as a negative SKU. Lines break only between words.
Font.registerHyphenationCallback((word) => [word]);

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
            <Text style={s.title}>Cotización de materiales</Text>
            <Text style={s.subtitle}>Asesor Corona, demo académica. Generada el {date}.</Text>
          </View>
        </View>

        {flagged && <Text style={[s.review, { marginBottom: 8, fontFamily: "Helvetica-Bold" }]}>Requiere revisión: ver el detalle al final de la cotización.</Text>}
        {quote?.data.projectSummary && <Text>{pdfText(quote.data.projectSummary)}</Text>}
        {project.space && (
          <Text style={s.muted}>
            Área {formatM2(project.space.areaM2)}, {formatM2(project.space.areaWithWasteM2)} con desperdicio.
          </Text>
        )}
        {laidTile && (
          <Text style={s.muted}>
            Calculado para {pdfText(laidTile.name)} ({laidTile.sku}).
          </Text>
        )}

        <Text style={s.h2}>Productos</Text>
        <View style={s.headRow}>
          <Text style={s.colName}>Producto</Text>
          <Text style={s.colQty}>Cantidad</Text>
          <Text style={s.colPrice}>Precio</Text>
          <Text style={s.colTotal}>Subtotal</Text>
        </View>
        {lines.map((line) => (
          <View key={line.sku} style={[s.row, quote?.lineChecks[line.sku] !== "computed" ? s.review : {}]}>
            <Text style={s.colName}>
              {pdfText(line.name)} <Text style={s.muted}>({line.sku})</Text>
            </Text>
            <Text style={s.colQty}>{formatQuantity(line.quantity, line.unit)}</Text>
            <Text style={s.colPrice}>{line.unitPrice === null ? "Sin precio" : `${formatCOP(line.unitPrice)} por ${line.unit}`}</Text>
            <Text style={s.colTotal}>{line.subtotal === null ? "Sin precio" : formatCOP(line.subtotal)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total{flagged ? " (requiere revisión)" : ""}</Text>
          <Text style={s.totalValue}>{formatCOP(quote?.data.total ?? 0)}</Text>
        </View>
        {quote?.data.budget != null && (
          <Text style={{ marginTop: 6, color: quote.data.withinBudget !== true ? REVIEW : flagged ? MUTED : BLUE }}>
            {quote.data.withinBudget === true && `Dentro del presupuesto de ${formatCOP(quote.data.budget)}.`}
            {quote.data.withinBudget === false && `Supera el presupuesto de ${formatCOP(quote.data.budget)} por ${formatCOP(-(quote.data.difference ?? 0))}.`}
            {quote.data.withinBudget == null && `Presupuesto de ${formatCOP(quote.data.budget)}: requiere revisión.`}
          </Text>
        )}

        {project.compatibility && (
          <>
            <Text style={s.h2}>Compatibilidad: {VERDICT_ES[project.compatibility.verdict]}</Text>
            {mismatch && (
              <Text style={[s.review, { marginBottom: 4 }]}>
                Se verificó con {pdfText(mismatch.checked.name)} ({mismatch.checked.sku}), otro revestimiento distinto al de los materiales.
              </Text>
            )}
            {project.compatibility.checks.map((check) => (
              <Text key={check.rule} style={{ marginBottom: 2 }}>
                {pdfText(check.rule)}: {pdfText(check.message)}
                {check.citationId ? ` [${check.citationId}]` : ""}
              </Text>
            ))}
          </>
        )}

        {project.review.length > 0 && (
          <>
            <Text style={s.h2}>Requiere revisión</Text>
            {project.review.map((item) => (
              <Text key={`${item.tool}-${item.field}`} style={[s.review, { marginBottom: 2 }]}>
                {pdfText(item.reason)}
              </Text>
            ))}
          </>
        )}

        {project.citations.length > 0 && (
          <Text style={[s.muted, { marginTop: 12, fontSize: 8.5 }]}>Fragmentos de fichas técnicas citados: {project.citations.join(", ")}.</Text>
        )}
        {quote?.data.priceNote && <Text style={[s.muted, { marginTop: 4, fontSize: 8.5 }]}>{pdfText(quote.data.priceNote)}</Text>}

        <Text style={s.footer} fixed>
          {DISCLAIMER_SHORT}
        </Text>
      </Page>
    </Document>
  );
}
