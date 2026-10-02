import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import catalog from "@/data/catalog.json";
import type { Product } from "@/lib/domain/types";

describe("next/image remote patterns", () => {
  it("allow every product image in the catalog, query string included", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    const urls = (catalog as Product[]).flatMap((p) => p.imageUrls);
    expect(urls.length).toBeGreaterThan(300);
    const blocked = urls.filter((u) => !hasRemoteMatch([], patterns, new URL(u)));
    expect(blocked).toEqual([]);
  });

  it("allow nothing outside Corona's media folder", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(hasRemoteMatch([], patterns, new URL("https://example.com/medias/x.jpg"))).toBe(false);
    expect(hasRemoteMatch([], patterns, new URL("https://corona.co/otra/x.jpg"))).toBe(false);
  });
});

describe("file tracing", () => {
  it("keeps the local prototype databases out of the citations route trace", () => {
    // Brackets are a glob character class, so the dynamic segment must be escaped or the key never matches.
    expect(nextConfig.outputFileTracingExcludes?.["/api/citations/\\[id\\]"]).toEqual(["./data/source/**/*"]);
  });
});
