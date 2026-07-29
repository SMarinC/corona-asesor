import Image from "next/image";
import { ChatShell } from "@/components/chat/ChatShell";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Micro-barra institucional: mismo patrón que corona.co (fila superior
          con links a otras unidades de negocio), en el azul oscuro
          institucional (#003865) para diferenciarlo del azul de acción. */}
      <div className="hidden sm:block bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-1.5 flex items-center justify-between text-xs">
          <span className="opacity-90">Organización Corona · Colombia</span>
          <a
            href="https://empresa.corona.co/"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-90 hover:opacity-100 hover:underline underline-offset-2"
          >
            Sitio corporativo
          </a>
        </div>
      </div>

      <header className="border-b border-border/70 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/corona-logo.png"
              alt="Corona"
              width={40}
              height={40}
              className="rounded-md shrink-0"
              priority
            />
            <div className="leading-tight">
              <span className="block font-heading text-base font-bold tracking-tight">Corona Asesor</span>
              <span className="block text-[11px] text-muted-foreground">Pisos y revestimientos</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-8 pb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary mb-2">
          Asesor de pisos y revestimientos
        </p>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-balance max-w-2xl mx-auto">
          Cotiza tu proyecto con datos reales del catálogo Corona
        </h1>
        <p className="mt-2.5 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto text-pretty leading-relaxed">
          Corona es una marca colombiana con más de un siglo de trayectoria. Este agente cotiza{" "}
          <strong className="font-medium text-foreground">pisos, pegantes y boquillas</strong> con productos,
          precios y compatibilidad reales, no suposiciones.
        </p>
      </section>

      <main className="flex flex-1 min-h-0">
        <ChatShell />
      </main>
    </div>
  );
}
