import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat route reads these with fs at runtime, which file tracing cannot see.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./data/catalog.json",
      "./data/sheets.json",
      "./data/sheets.index.bin",
      "./data/manifest.json",
      "./data/company-context.json",
    ],
  },
  // The cwd-relative data path makes the tracer pull in the whole folder, including the local prototype databases.
  outputFileTracingExcludes: {
    "/api/chat": ["./data/source/**/*"],
  },
};

export default withBotId(nextConfig);
