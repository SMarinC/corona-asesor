"use client";

import { ArrowUp, Square } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_CHARS } from "@/lib/guard/limits";
import { formatNumber } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

/** Show the counter only when the limit is close, so it reads as a warning rather than noise. */
const COUNTER_FROM = 800;

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  /** Why sending is blocked right now (rate limit countdown, bot check); null when it is allowed. */
  blockedReason: string | null;
}

export function Composer({ onSend, onStop, busy, blockedReason }: ComposerProps) {
  const [text, setText] = useState("");
  const id = useId();
  const helpId = `${id}-help`;
  const length = text.length;
  const tooLong = length > MAX_MESSAGE_CHARS;
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const wasBlocked = useRef(false);
  const blocked = blockedReason !== null;
  // A disabled textarea drops focus; give it back when the lock lifts so the visitor can keep typing.
  useEffect(() => {
    if (wasBlocked.current && !blocked) boxRef.current?.focus();
    wasBlocked.current = blocked;
  }, [blocked]);
  const canSend = !busy && blockedReason === null && text.trim().length > 0 && !tooLong;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // keyCode 229 covers browsers that report the Enter confirming an IME candidate after compositionend.
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !event.shiftKey && !composing) submit(event);
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-2 shadow-[0_1px_2px_rgb(15_27_45/0.06),0_8px_24px_-12px_rgb(15_27_45/0.18)] focus-within:border-primary/60">
      <label htmlFor={id} className="sr-only">
        Describe tu proyecto
      </label>
      <textarea
        id={id}
        ref={boxRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder={blockedReason ?? "Describe el espacio: piso o pared, medidas, si es húmedo o exterior, junta y presupuesto"}
        disabled={blockedReason !== null}
        aria-invalid={tooLong}
        aria-describedby={helpId}
        className="block max-h-48 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-[0.95rem] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between gap-2 pl-2">
        <p id={helpId} className={cn("text-xs tabular", tooLong ? "text-bad" : "text-muted-foreground")}>
          {length >= COUNTER_FROM ? `${formatNumber(length)} / ${formatNumber(MAX_MESSAGE_CHARS)} caracteres` : "Enter para enviar, Shift + Enter para una línea nueva"}
        </p>
        {busy ? (
          <Button type="button" variant="outline" size="lg" onClick={onStop} aria-label="Detener la respuesta">
            <Square aria-hidden className="size-3.5 fill-current" />
            Detener
          </Button>
        ) : (
          <Button type="submit" size="icon-lg" disabled={!canSend} aria-label="Enviar mensaje" className="rounded-xl">
            <ArrowUp aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}
