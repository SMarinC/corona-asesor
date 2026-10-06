"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { DisclaimerDialog } from "@/components/legal/disclaimer-dialog";
import { MobileProjectBar } from "@/components/project/mobile-project-bar";
import { ProjectPanel } from "@/components/project/project-panel";
import { ToolStep } from "@/components/tools/tool-step";
import { useDeadlinePassed } from "@/hooks/use-deadline-passed";
import { useTurnTimings } from "@/hooks/use-turn-timings";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { fitHistoryBudget, truncateHistory } from "@/lib/guard/limits";
import { chatFetch, parseChatError } from "@/lib/ui/chat-error";
import { deriveProject } from "@/lib/ui/derive-project";
import { DISCLAIMER_SHORT } from "@/lib/ui/legal";
import { preloadAssistantText } from "./assistant-text";
import { CitationsProvider } from "./citations-context";
import { ComposerDock, isLocked } from "./composer-dock";
import { EmptyState } from "./empty-state";
import type { ChatFailure } from "./error-notice";
import { Message } from "./message";
import { SiteHeader } from "./site-header";

/** Sends exactly the history the server would keep: the server rejects bodies over its byte cap before trimming. */
export const prepareChatRequest: NonNullable<ConstructorParameters<typeof DefaultChatTransport<CoronaUIMessage>>[0]>["prepareSendMessagesRequest"] = ({ id, messages }) => ({
  body: { id, messages: fitHistoryBudget(truncateHistory(messages)) },
});

const transport = new DefaultChatTransport<CoronaUIMessage>({ api: "/api/chat", fetch: chatFetch, prepareSendMessagesRequest: prepareChatRequest });

/**
 * Keeps the newest content in view while the visitor stays near the bottom. A ResizeObserver also catches growth
 * that is not a new message part, such as product photos finishing to load. `active` is false on the empty state,
 * which reads top-down: on a short screen it must open on its heading, not on its last suggestion.
 */
function useStickToBottom(active: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
    if (!active && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [active]);
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const onScroll = () => {
      stuck.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
    };
    const observer = new ResizeObserver(() => {
      if (stuck.current && activeRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(content);
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);
  /** Sending a message always brings the conversation back to the bottom. */
  const stick = () => {
    stuck.current = true;
  };
  return { scrollRef, contentRef, stick };
}

export function ChatApp() {
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [failureId, setFailureId] = useState(0);
  const [stopped, setStopped] = useState(false);
  const { messages, sendMessage, status, stop, regenerate, setMessages, clearError } = useChat<CoronaUIMessage>({
    transport,
    onError: (error) => {
      const view = parseChatError(error);
      setFailureId((id) => id + 1);
      setFailure({ view, retryAt: view.retryAfter === null ? null : Date.now() + view.retryAfter * 1_000 });
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const project = useMemo(() => deriveProject(messages), [messages]);
  const { timings, store } = useTurnTimings(messages, busy);
  // One timer flips this at the deadline; the per-second countdown lives in ComposerDock, away from the messages.
  const waitOver = useDeadlinePassed(failure?.retryAt ?? null);
  const suggestionsLocked = isLocked(failure, waitOver);
  const { scrollRef, contentRef, stick } = useStickToBottom(messages.length > 0);
  const waitingForFirstPart = status === "submitted" || (busy && messages.at(-1)?.role === "user");

  const send = (text: string) => {
    if (busy || suggestionsLocked) return;
    stick();
    setStopped(false);
    setFailure(null);
    clearError();
    // The model's first token takes about a second; the markdown renderer loads in that time.
    preloadAssistantText();
    void sendMessage({ text });
  };
  const retry = () => {
    setStopped(false);
    setFailure(null);
    clearError();
    void regenerate();
  };
  const stopTurn = () => {
    setStopped(true);
    void stop();
  };
  const restart = () => {
    setStopped(false);
    void stop();
    setMessages([]);
    setFailure(null);
    clearError();
    store.reset();
  };

  const panel = <ProjectPanel project={project} messages={messages} timings={timings} />;

  return (
    <CitationsProvider ids={project.citations}>
      <div className="flex h-dvh flex-col">
        <SiteHeader onRestart={restart} canRestart={messages.length > 0} />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(340px,410px)]">
          <main className="flex min-h-0 min-w-0 flex-col">
            <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
              {/* role="log" is implicitly live; "off" keeps it silent per token. The status line below is the one announcement. */}
              <div ref={contentRef} role="log" aria-live="off" aria-busy={busy} aria-label="Conversación" className="mx-auto max-w-2xl min-w-0 space-y-6 px-4 py-6">
                {messages.length === 0 ? (
                  <EmptyState onPick={send} disabled={suggestionsLocked} />
                ) : (
                  messages.map((message, i) => <Message key={message.id} message={message} streaming={busy && i === messages.length - 1} />)
                )}
                {waitingForFirstPart && (
                  <ol>
                    <ToolStep label="Leyendo tu mensaje" phase="running" />
                  </ol>
                )}
              </div>
            </div>
            <div className="mx-auto w-full max-w-2xl min-w-0 space-y-2 px-4 pt-2 pb-3">
              <p role="status" className="sr-only">
                {busy ? "El asesor está trabajando." : status === "ready" && messages.length > 0 ? (stopped ? "Respuesta detenida." : "Respuesta lista.") : ""}
              </p>
              <ComposerDock failure={failure} failureId={failureId} busy={busy} onSend={send} onStop={stopTurn} onRetry={retry} onRestart={restart}>
                <MobileProjectBar project={project} busy={busy}>
                  {panel}
                </MobileProjectBar>
              </ComposerDock>
              <p className="text-center text-xs text-muted-foreground text-pretty">
                {DISCLAIMER_SHORT}{" "}
                <DisclaimerDialog
                  trigger={
                    <button type="button" className="font-medium text-primary underline underline-offset-2">
                      Más información
                    </button>
                  }
                />
              </p>
            </div>
          </main>
          <aside aria-labelledby="project-title" className="relative hidden min-h-0 overflow-y-auto border-l bg-card px-6 py-6 lg:block">
            <h2 id="project-title" className="mb-5 text-lg font-semibold tracking-[-0.01em]">
              Tu proyecto
            </h2>
            {panel}
          </aside>
        </div>
      </div>
    </CitationsProvider>
  );
}
