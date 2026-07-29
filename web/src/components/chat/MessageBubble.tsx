"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CircleUser } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types/chat";
import { TracePanel } from "./TracePanel";
import { PdfDownloadButtons } from "./PdfDownloadButtons";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border overflow-hidden",
          isUser ? "bg-secondary border-border text-secondary-foreground" : "border-border bg-primary"
        )}
        aria-hidden
      >
        {isUser ? (
          <CircleUser className="size-4.5" />
        ) : (
          <Image src="/corona-logo.png" alt="" width={32} height={32} className="size-full object-cover" />
        )}
      </div>

      <div className={cn("min-w-0 max-w-[85%] sm:max-w-[75%]", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4.5 py-3.5 text-[15px] leading-relaxed shadow-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border rounded-tl-sm"
          )}
        >
          {message.pending ? (
            <ThinkingDots />
          ) : (
            <div
              className={cn(
                "prose prose-base max-w-none break-words",
                "prose-p:leading-[1.7] prose-p:my-2.5 first:prose-p:mt-0 last:prose-p:mb-0",
                "prose-ul:my-2.5 prose-li:my-1 prose-li:leading-[1.7] prose-strong:font-semibold",
                "prose-headings:font-heading prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2",
                isUser
                  ? "prose-invert prose-a:text-primary-foreground prose-strong:text-primary-foreground"
                  : "prose-a:text-primary prose-strong:text-foreground"
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) =>
                    typeof src === "string" ? (
                      <span className="block my-2 overflow-hidden rounded-lg border border-border max-w-64">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={alt || "Producto"} className="w-full h-auto object-cover" loading="lazy" />
                      </span>
                    ) : null,
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {children}
                    </a>
                  ),
                }}
              >
                {message.contenido}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && message.trace && message.trace.length > 0 && (
          <div className="w-full">
            <TracePanel trace={message.trace} />
            <PdfDownloadButtons trace={message.trace} />
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="El agente está pensando">
      <span className="size-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:-0.3s]" />
      <span className="size-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:-0.15s]" />
      <span className="size-1.5 rounded-full bg-current opacity-40 animate-bounce" />
    </span>
  );
}
