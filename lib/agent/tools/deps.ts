import type { Catalog } from "@/lib/data/catalog";
import type { CompanyContext } from "@/lib/data/company";
import type { SheetSearch } from "@/lib/data/sheets";

/** Everything a tool reads. Injected so tests run against fixtures with no network. */
export interface ToolDeps {
  catalog: Catalog;
  sheets: SheetSearch;
  company: CompanyContext;
}
