"use client";

import type { CoronaUIMessage } from "@/lib/agent/agent";
import { type CoronaToolPart, isToolPart, toolRejected } from "@/lib/ui/tool-parts";
import { ToolCard } from "@/components/tools/tool-card";
import { AssistantText } from "./assistant-text";

type Block = { kind: "tools"; parts: CoronaToolPart[] } | { kind: "text"; text: string };

/** Consecutive tool calls form one work log; text parts stay where the model wrote them. Gate rejections never ran, so they get no card. */
export function toBlocks(message: CoronaUIMessage): Block[] {
  const blocks: Block[] = [];
  for (const part of message.parts) {
    if (isToolPart(part)) {
      if (toolRejected(part)) continue;
      const last = blocks.at(-1);
      if (last?.kind === "tools") last.parts.push(part);
      else blocks.push({ kind: "tools", parts: [part] });
    } else if (part.type === "text" && part.text.trim().length > 0) {
      blocks.push({ kind: "text", text: part.text });
    }
  }
  return blocks;
}

export function Message({ message, streaming }: { message: CoronaUIMessage; streaming: boolean }) {
  if (message.role === "user") {
    const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-accent-foreground">
          {text}
        </p>
      </div>
    );
  }
  const blocks = toBlocks(message);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) =>
        block.kind === "tools" ? (
          <ol key={i} aria-label="Pasos del asesor" className="relative space-y-3 before:absolute before:top-3 before:bottom-3 before:left-2.5 before:w-px before:bg-border">
            {block.parts.map((part) => (
              <ToolCard key={part.toolCallId} part={part} />
            ))}
          </ol>
        ) : (
          <AssistantText key={i} text={block.text} streaming={streaming && i === blocks.length - 1} />
        ),
      )}
    </div>
  );
}
