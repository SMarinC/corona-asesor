import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Server and domain tests run in node; component tests opt into jsdom with a `@vitest-environment jsdom` docblock.
    environment: "node",
  },
});
