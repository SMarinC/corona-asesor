"use client";

import { Component, lazy, memo, type ReactNode, Suspense } from "react";

type Markdown = typeof import("./assistant-markdown");

// Streamdown (markdown, sanitizer and highlighter) is the largest client chunk; the empty state never needs it.
const loadMarkdown = (): Promise<Markdown> => import("./assistant-markdown");

// lazy() caches a rejection for good, so a failed load swaps in a fresh lazy: the next message can still upgrade.
function makeLazy() {
  return lazy(() =>
    loadMarkdown()
      .catch(loadMarkdown) // one retry for a flaky network
      .catch((error: unknown) => {
        AssistantMarkdown = makeLazy();
        throw error;
      }),
  );
}
let AssistantMarkdown = makeLazy();

/** Starts downloading the markdown renderer, e.g. when the visitor sends a first message. */
export function preloadAssistantText(): void {
  loadMarkdown().catch(() => {});
}

function PlainText({ text }: { text: string }) {
  return (
    <p data-markdown-fallback="" className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">
      {text}
    </p>
  );
}

/** A failed renderer download degrades this one message to plain text instead of unmounting the page. */
class MarkdownBoundary extends Component<{ text: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <PlainText text={this.props.text} /> : this.props.children;
  }
}

/** The model's answer. Plain text until the markdown renderer arrives, which is usually before the first token. */
export const AssistantText = memo(function AssistantText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <MarkdownBoundary text={text}>
      <Suspense fallback={<PlainText text={text} />}>
        <AssistantMarkdown text={text} streaming={streaming} />
      </Suspense>
    </MarkdownBoundary>
  );
});
