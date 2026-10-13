import { createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { formatTime } from "../lib/api";
import { playerBus } from "../lib/playerBus";

/** Block ID → start time, for the lecture on screen. Citation chips read it to show and seek. */
export const BlockTimes = createContext<Map<string, number>>(new Map());

// Answers store citations as [F07]; turn them into links the renderer below shows as chips.
const withCitationLinks = (md: string) => md.replace(/\[(F\d{1,3})\]/g, "[$1](#cite-$1)");

export function CitationChip({ id }: { id: string }) {
  const sec = useContext(BlockTimes).get(id);
  if (sec === undefined) return null;
  return (
    <button
      type="button"
      onClick={() => playerBus.seek(sec)}
      title={`Jump to ${formatTime(sec)} (${id})`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-full bg-indigo-50 px-1.5 py-px align-baseline font-mono text-[0.75em] font-medium text-indigo-700 no-underline ring-1 ring-indigo-200 transition hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800 dark:hover:bg-indigo-900"
    >
      {formatTime(sec)}
    </button>
  );
}

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose prose-stone prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-pre:my-2 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children: label }) =>
            href?.startsWith("#cite-") ? (
              <CitationChip id={href.slice(6)} />
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ),
        }}
      >
        {withCitationLinks(children)}
      </ReactMarkdown>
    </div>
  );
}
