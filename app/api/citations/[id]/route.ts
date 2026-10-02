import { getSheetChunk } from "@/lib/data/sheet-chunks";
import { CITATION_ID } from "@/lib/ui/citations";
import { toCitationFragment } from "@/lib/ui/citation-fragment";

export const runtime = "nodejs";

/** The data is a frozen snapshot, so a fragment never changes for the life of a deployment. */
const CACHE = "public, max-age=86400, s-maxage=31536000, immutable";

export async function GET(_req: Request, ctx: RouteContext<"/api/citations/[id]">): Promise<Response> {
  const { id } = await ctx.params;
  const chunk = CITATION_ID.test(id) ? getSheetChunk(id) : undefined;
  if (!chunk) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return Response.json(toCitationFragment(chunk), { headers: { "cache-control": CACHE } });
}
