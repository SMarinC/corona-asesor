"use client";

import { memo, type ReactNode } from "react";
import { type Components, Streamdown } from "streamdown";
import { citationIdFromHref, linkCitations } from "@/lib/ui/citations";
import { Citation } from "./citations-context";

const components: Components = {
  a: ({ href, children }) => {
    const url = typeof href === "string" ? href : undefined;
    const citation = citationIdFromHref(url);
    if (citation) return <Citation id={citation} />;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
        {children as ReactNode}
      </a>
    );
  },
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
