"use client";

import { Moon, RotateCcw, Sun } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { DisclaimerDialog } from "@/components/legal/disclaimer-dialog";
import { Button } from "@/components/ui/button";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is unknown during server rendering, so the label stays the same in both themes.
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Cambiar entre tema claro y oscuro">
      <Sun aria-hidden className="hidden dark:block" />
      <Moon aria-hidden className="dark:hidden" />
    </Button>
  );
}

export function SiteHeader({ onRestart, canRestart }: { onRestart: () => void; canRestart: boolean }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:gap-3 sm:px-4">
      <Image src="/corona-logo.png" alt="" width={28} height={28} priority className="size-7 shrink-0" />
      <h1 className="min-w-0 truncate font-semibold tracking-[-0.01em]">Asesor Corona</h1>
      <DisclaimerDialog
        trigger={
          <button
            type="button"
            className="shrink-0 rounded-full border border-primary/30 bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground hover:border-primary/60"
          >
            Demo académica
          </button>
        }
      />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onRestart} disabled={!canRestart}>
          <RotateCcw aria-hidden />
          <span className="hidden sm:inline">Nueva conversación</span>
          <span className="sr-only sm:hidden">Nueva conversación</span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
