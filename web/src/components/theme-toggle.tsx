"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Necesario para evitar un mismatch de hidratación: el tema real solo se
  // conoce en el cliente (localStorage/prefers-color-scheme), así que el
  // ícono correcto solo puede pintarse después del montaje. Patrón estándar
  // de next-themes; el setState síncrono en el effect es intencional aquí.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="size-11 sm:size-9 rounded-full"
    >
      {mounted ? isDark ? <Sun className="size-4" /> : <Moon className="size-4" /> : <span className="size-4" />}
    </Button>
  );
}
