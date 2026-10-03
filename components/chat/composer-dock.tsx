"use client";

import type { ReactNode } from "react";
import { useCountdown } from "@/hooks/use-countdown";
import { formatWait } from "@/lib/ui/format";
import { Composer } from "./composer";
import { type ChatFailure, ErrorNotice } from "./error-notice";

/** Failures that stop the visitor from sending, ignoring any countdown that is already over. */
export function isLockingFailure(failure: ChatFailure | null): boolean {
  const kind = failure?.view.kind;
  return kind === "rate_limited" || kind === "quota_exhausted" || kind === "bot_detected";
}

export function blockedReason(failure: ChatFailure | null, remaining: number | null): string | null {
  if (!failure) return null;
  const { kind } = failure.view;
  if ((kind === "rate_limited" || kind === "quota_exhausted") && remaining !== null && remaining > 0) {
    return `Podrás escribir de nuevo en ${formatWait(remaining)}`;
  }
  if (kind === "bot_detected") return "Recarga la página para continuar";
  return null;
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
