import type { Chapter } from "@lecture-lens/shared";
import { formatTime } from "../lib/api";
import { playerBus, usePlayerSelect } from "../lib/playerBus";
import { Markdown } from "./Markdown";

export function SummaryTab({ overview, chapters }: { overview: string | null; chapters: Chapter[] }) {
  // Re-render only when the chapter being watched changes, not on every video tick.
  const activeIdx = usePlayerSelect((t) => chapters.findIndex((c) => t >= c.startSec && t < c.endSec));
  return (
    <div className="p-4">
      {overview && (
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-medium text-muted">Overview</h3>
          <div className="callout anim-fade">
            <Markdown className="text-[15px]">{overview}</Markdown>
          </div>
        </section>
      )}
      <h3 className="mb-1 text-xs font-medium text-muted">Chapters</h3>
      {chapters.length === 0 && <p className="text-sm text-muted">No chapters yet.</p>}
      <ol className="-mx-2">
        {chapters.map((c, i) => {
          const active = i === activeIdx;
          return (
            <li key={c.id} aria-current={active ? "true" : undefined} className={`rounded-lg px-2 py-2.5 transition-colors duration-300 ${active ? "bg-accent-wash" : "hover:bg-hover"}`}>
              <button type="button" onClick={() => playerBus.seek(c.startSec)} className="group flex w-full items-baseline gap-3 text-left">
                <span className={`w-11 shrink-0 font-mono text-xs tabular-nums ${active ? "font-medium text-accent" : "text-faint"}`}>{formatTime(c.startSec)}</span>
                <span className="font-medium">{c.title}</span>
              </button>
              <Markdown className="mt-0.5 pl-14 text-muted">{c.summary}</Markdown>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
