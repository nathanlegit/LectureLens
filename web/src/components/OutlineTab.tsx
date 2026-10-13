import type { Chapter } from "@lecture-lens/shared";
import { formatTime } from "../lib/api";
import { playerBus, usePlayerTime } from "../lib/playerBus";
import { Markdown } from "./Markdown";

export function OutlineTab({ chapters }: { chapters: Chapter[] }) {
  const time = usePlayerTime();
  if (chapters.length === 0) return <p className="p-4 text-sm text-stone-500">No chapters yet.</p>;

  return (
    <ol className="divide-y divide-stone-200 dark:divide-stone-800">
      {chapters.map((c) => {
        const active = time >= c.startSec && time < c.endSec;
        return (
          <li
            key={c.id}
            aria-current={active ? "true" : undefined}
            className={`px-4 py-3 transition ${active ? "bg-indigo-50/70 dark:bg-indigo-950/40" : ""}`}
          >
            <button
              type="button"
              onClick={() => playerBus.seek(c.startSec)}
              className="flex w-full items-baseline gap-3 text-left hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              <span className={`w-12 shrink-0 font-mono text-xs ${active ? "text-indigo-600 dark:text-indigo-400" : "text-stone-500"}`}>
                {formatTime(c.startSec)}
              </span>
              <span className="font-medium">{c.title}</span>
            </button>
            <Markdown className="mt-1 pl-15 text-stone-600 dark:text-stone-400">{c.summary}</Markdown>
          </li>
        );
      })}
    </ol>
  );
}
