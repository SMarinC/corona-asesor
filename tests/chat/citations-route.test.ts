import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/citations/[id]/route";

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

  it("caps long fragments", async () => {
    const body = await (await call("c0001")).json();
    expect(body.text.length).toBeLessThanOrEqual(1_201);
  });

  it("answers 404 for unknown or malformed ids without reading anything else", async () => {
    expect((await call("c9999")).status).toBe(404);
    expect((await call("../manifest")).status).toBe(404);
  });
});
