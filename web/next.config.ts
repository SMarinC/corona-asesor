import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fija la raíz del workspace a esta carpeta (web/): el repo padre tiene su
  // propio lockfile de Python/otro tooling que Turbopack detectaba y que no
  // tiene relación con este proyecto Next.js.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // @duckdb/node-api carga bindings nativos (.node) por plataforma con un
  // require() dinámico (switch sobre process.platform/arch). El bundler de
  // Next intenta resolver TODAS las ramas del switch en build time y falla
  // porque solo está instalado el binding de esta plataforma (win32-x64).
  // Sacarlo del bundling (require nativo de Node en runtime) resuelve esto —
  // mismo mecanismo que Next ya aplica de fábrica a paquetes similares como
  // better-sqlite3 o sqlite3 (ver server-external-packages.jsonc).
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
};

export default nextConfig;
