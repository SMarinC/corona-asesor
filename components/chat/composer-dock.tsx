"use client";

import type { ReactNode } from "react";
import { useCountdown } from "@/hooks/use-countdown";
import { formatWait } from "@/lib/ui/format";
import { Composer } from "./composer";
import { type ChatFailure, ErrorNotice } from "./error-notice";

/** One rule for both the input and the suggestion chips; `remaining` is the live countdown, null when nothing ticks. */
export function blockedReason(failure: ChatFailure | null, remaining: number | null): string | null {
  if (!failure) return null;
  const { kind } = failure.view;
  if ((kind === "rate_limited" || kind === "quota_exhausted") && failure.retryAt !== null && (remaining === null || remaining > 0)) {
    return remaining === null ? "Espera un momento para escribir de nuevo" : `Podrás escribir de nuevo en ${formatWait(remaining)}`;
  }
  if (kind === "bot_detected") return "Recarga la página para continuar";
  return null;
}

/** The same lock for the chips, without the per-second countdown: `waitOver` flips once at the deadline. */
export function isLocked(failure: ChatFailure | null, waitOver: boolean): boolean {
  return blockedReason(failure, waitOver ? 0 : null) !== null;
}

export interface ComposerDockProps {
  failure: ChatFailure | null;
  /** Changes with every failure, so a new one remounts the notice and its alert is announced again. */
  failureId: number;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onRestart: () => void;
  /** Rendered between the notice and the input (the mobile project bar). */
  children?: ReactNode;
}

/**
 * The countdown lives here, in a leaf beside the message list, so the ticking re-renders only the notice and the
 * input and never the conversation.
 */
export function ComposerDock({ failure, failureId, busy, onSend, onStop, onRetry, onRestart, children }: ComposerDockProps) {
  const remaining = useCountdown(failure?.retryAt ?? null);
  return (
    <>
      {failure && <ErrorNotice key={failureId} failure={failure} remaining={remaining} onRetry={onRetry} onRestart={onRestart} />}
      {children}
      <Composer onSend={onSend} onStop={onStop} busy={busy} blockedReason={blockedReason(failure, remaining)} />
    </>
  );
}
