import type { Chapter } from "@lecture-lens/shared";
import { formatTime } from "../lib/api";
import { playerBus, usePlayerTime } from "../lib/playerBus";
import { Markdown } from "./Markdown";

export function SummaryTab({ overview, chapters }: { overview: string | null; chapters: Chapter[] }) {
  const time = usePlayerTime();
  return (
    <div className="p-4">
      {overview && (
        <section className="mb-6">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-faint uppercase">Overview</h3>
          <Markdown className="text-[15px]">{overview}</Markdown>
        </section>
      )}
      <h3 className="mb-1 text-xs font-medium tracking-wide text-faint uppercase">Chapters</h3>
      {chapters.length === 0 && <p className="text-sm text-muted">No chapters yet.</p>}
      <ol>
        {chapters.map((c) => {
          const active = time >= c.startSec && time < c.endSec;
          return (
            <li key={c.id} aria-current={active ? "true" : undefined} className={`-mx-2 rounded-ui px-2 py-2.5 ${active ? "bg-accent-soft" : ""}`}>
              <button type="button" onClick={() => playerBus.seek(c.startSec)} className="flex w-full items-baseline gap-3 text-left hover:text-accent">
                <span className={`w-11 shrink-0 font-mono text-xs ${active ? "text-accent" : "text-faint"}`}>{formatTime(c.startSec)}</span>
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
