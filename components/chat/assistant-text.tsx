"use client";

import { memo, type ReactNode } from "react";
import { type Components, Streamdown } from "streamdown";
import { citationIdFromHref, linkCitations } from "@/lib/ui/citations";
import { Citation } from "./citations-context";

const components: Components = {
  a: ({ href, children }) => {
    const url = typeof href === "string" ? href : undefined;
    // Streamdown closes a half-typed "[c00" as a link to this placeholder; keep it as plain text until it completes.
    if (url === "streamdown:incomplete-link") return <span>{children as ReactNode}</span>;
    const citation = citationIdFromHref(url);
    if (citation) return <Citation id={citation} />;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2 wrap-anywhere">
        {children as ReactNode}
      </a>
    );
  },
  // Images from the model are a tracking vector; product images live in the cards.
  img: () => null,
};

/** The model's answer as streaming markdown; "[c0084]" becomes a chip that opens the cited fragment. */
export const AssistantText = memo(function AssistantText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Streamdown
      className="space-y-3 text-[0.95rem] leading-relaxed [&_li]:my-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      components={components}
      isAnimating={streaming}
      controls={false}
    >
      {linkCitations(text)}
    </Streamdown>
  );
});
