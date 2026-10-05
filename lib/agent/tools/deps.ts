import type { Catalog } from "@/lib/data/catalog";
import type { CompanyContext } from "@/lib/data/company";
import type { SheetSearch } from "@/lib/data/sheets";
import type { QuantityLedger } from "@/lib/domain/quantity-check";

/** Everything a tool reads. Injected so tests run against fixtures with no network. */
export interface ToolDeps {
  catalog: Catalog;
  sheets: SheetSearch;
  company: CompanyContext;
  /** Per-conversation record of computeMaterials results; when present, buildQuote flags quantities none of them produced. */
  quantities?: QuantityLedger;
}
