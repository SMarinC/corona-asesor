import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop `next dev` from regenerating AGENTS.md / CLAUDE.md at the repo root.
  agentRules: false,
  // Product photos come from Corona's public CDN; nothing else is allowed through the optimizer.
  // No `search` key: the catalog URLs carry a ?context= query that must stay allowed.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "corona.co", pathname: "/medias/**" }],
  },
  // These routes read the artifacts with fs at runtime, which file tracing cannot see.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./data/catalog.json",
      "./data/sheets.json",
      "./data/sheets.index.bin",
      "./data/manifest.json",
      "./data/company-context.json",
    ],
    "/api/citations/\\[id\\]": ["./data/sheets.json"],
  },
  // The cwd-relative data path makes the tracer pull in the whole folder, including the local prototype databases.
  outputFileTracingExcludes: {
    "/api/chat": ["./data/source/**/*"],
    "/api/citations/\\[id\\]": ["./data/source/**/*"],
  },
};

export default withBotId(nextConfig);
