"use client";

import { CircleAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ChatErrorView, chatErrorCopy } from "@/lib/ui/chat-error";

export interface ChatFailure {
  view: ChatErrorView;
  /** Epoch ms when the input may be used again; null when there is nothing to wait for. */
  retryAt: number | null;
}

export interface ErrorNoticeProps {
  failure: ChatFailure;
  remaining: number | null;
  onRetry: () => void;
  onRestart: () => void;
}

/** One error at a time, above the input: what happened, how long to wait, and the one action that helps. */
export function ErrorNotice({ failure, remaining, onRetry, onRestart }: ErrorNoticeProps) {
  const { kind } = failure.view;
  const waiting = kind === "rate_limited" || kind === "quota_exhausted";
  const counting = waiting && remaining !== null && remaining > 0;
  const Icon = waiting ? Clock : CircleAlert;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-review-surface px-3.5 py-2.5 text-sm text-review">
      <Icon aria-hidden className="size-4 shrink-0" />
      {/* An alert re-reads every change: announce the wait once from the server value and keep the ticking copy visual only. */}
      {counting && <span className="sr-only">{chatErrorCopy(failure.view, failure.view.retryAfter)}</span>}
      <p aria-hidden={counting || undefined} className="min-w-0 flex-1 tabular">
        {chatErrorCopy(failure.view, remaining)}
      </p>
      {(kind === "model_error" || kind === "network") && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      )}
      {kind === "invalid_input" && (
        <Button size="sm" variant="outline" onClick={onRestart}>
          Empezar de nuevo
        </Button>
      )}
      {kind === "bot_detected" && (
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Recargar la página
        </Button>
      )}
    </div>
  );
}
