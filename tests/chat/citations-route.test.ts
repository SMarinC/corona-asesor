import { describe, expect, it } from "vitest";
import { dynamicParams, generateStaticParams, GET } from "@/app/api/citations/[id]/route";
import { getSheetChunk } from "@/lib/data/sheet-chunks";

const call = (id: string) => GET(new Request(`http://localhost/api/citations/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/citations/[id]", () => {
  it("returns the cited fragment from the snapshot, cacheable forever", async () => {
    const res = await call("c0046");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    const body = await res.json();
    expect(body).toMatchObject({ citationId: "c0046", section: "DESCRIPCIÓN DEL PRODUCTO", truncated: false });
    expect(body.skus).toContain("901391501");
    expect(body.text).toContain("no gres porcelánico");
  });

  it("caps a real long fragment and marks it truncated", async () => {
    // c0002 is 1,235 characters in the snapshot.
    expect(getSheetChunk("c0002")!.text.length).toBeGreaterThan(1_200);
    const body = await (await call("c0002")).json();
    expect(body.truncated).toBe(true);
    expect(body.text.length).toBe(1_201);
    expect(body.text.endsWith("…")).toBe(true);
  });

  it("reports when the SKU list was cut", async () => {
    // c0003 carries 47 SKUs in the snapshot.
    const body = await (await call("c0003")).json();
    expect(body.skus).toHaveLength(10);
    expect(body.skuCount).toBe(47);
    expect(body.skusTruncated).toBe(true);
  });

  it("answers 404 for unknown or malformed ids without echoing them or reading anything else", async () => {
    for (const id of ["c9999", "../manifest", "c0046<script>"]) {
      const res = await call(id);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: { code: "not_found" } });
      expect(text).not.toContain(id);
    }
  });

  it("prerenders every fragment and 404s anything else without invoking the function", async () => {
    expect(dynamicParams).toBe(false);
    const params = await generateStaticParams();
    expect(params).toHaveLength(912);
    expect(params).toContainEqual({ id: "c0046" });
  });
});
