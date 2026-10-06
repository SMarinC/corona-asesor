"use client";

import { lazy, memo, Suspense } from "react";

// Streamdown (markdown, sanitizer and highlighter) is the largest client chunk; the empty state never needs it.
const loadMarkdown = () => import("./assistant-markdown");
const AssistantMarkdown = lazy(loadMarkdown);

/** Starts downloading the markdown renderer, e.g. when the visitor sends a first message. */
export function preloadAssistantText(): void {
  void loadMarkdown();
}

/** The model's answer. Plain text until the markdown renderer arrives, which is usually before the first token. */
export const AssistantText = memo(function AssistantText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Suspense fallback={<p data-markdown-fallback="" className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{text}</p>}>
      <AssistantMarkdown text={text} streaming={streaming} />
    </Suspense>
  );
});
