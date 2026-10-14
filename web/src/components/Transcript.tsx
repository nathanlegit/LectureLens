import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Segment } from "@lecture-lens/shared";
import { formatTime, getJSON } from "../lib/api";
import { playerBus, usePlayerTime } from "../lib/playerBus";

/** Index of the segment playing at `time`: the last one that has started. */
export function activeSegment(segments: Segment[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.startSec <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

const FOLLOW_PAUSE_MS = 6000;

/**
 * The lecture's transcript under the video. The current line is highlighted and kept in view while
 * the video plays; scrolling by hand pauses that for a few seconds. Clicking a line seeks there.
 */
export function Transcript({ lectureId, className = "" }: { lectureId: string; className?: string }) {
  const { data: segments = [], isPending } = useQuery({
    queryKey: ["transcript", lectureId],
    queryFn: () => getJSON<Segment[]>(`/api/lectures/${lectureId}/transcript`),
    staleTime: Infinity,
  });
  const time = usePlayerTime();
  const [query, setQuery] = useState("");
  const [pausedUntil, setPausedUntil] = useState(0);
  const list = useRef<HTMLOListElement>(null);
  const programmatic = useRef(false);

  const active = activeSegment(segments, time);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => segments.map((s, i) => ({ s, i })).filter(({ s }) => !q || s.text.toLowerCase().includes(q)),
    [segments, q],
  );
  const following = !q && Date.now() >= pausedUntil;

  // Keep the active line in view, unless the reader is scrolling or searching.
  useEffect(() => {
    if (!following || active < 0) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    const box = list.current;
    if (!el || !box) return;
    const target = el.offsetTop - box.clientHeight / 3;
    if (Math.abs(box.scrollTop - target) < 4) return;
    programmatic.current = true;
    box.scrollTo({ top: target, behavior: "smooth" });
    window.setTimeout(() => (programmatic.current = false), 600);
  }, [active, following]);

  // A re-render once the pause ends, so following resumes without needing a new line.
  useEffect(() => {
    if (pausedUntil <= Date.now()) return;
    const t = window.setTimeout(() => setPausedUntil(0), pausedUntil - Date.now());
    return () => window.clearTimeout(t);
  }, [pausedUntil]);

  const userScrolled = () => {
    if (!programmatic.current) setPausedUntil(Date.now() + FOLLOW_PAUSE_MS);
  };

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className}`} aria-label="Transcript">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-sm font-medium">Transcript</h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the transcript"
          aria-label="Search the transcript"
          className="field ml-auto h-7 w-44 max-w-[55%] py-0 text-xs"
        />
      </div>
      <div className="relative min-h-0 flex-1">
        <ol
          ref={list}
          onWheel={userScrolled}
          onTouchMove={userScrolled}
          onKeyDown={userScrolled}
          className="scroll-quiet absolute inset-0 overflow-y-auto px-1.5 py-1.5"
        >
          {isPending && <li className="px-2 py-2 text-sm text-muted">Loading the transcript…</li>}
          {!isPending && segments.length === 0 && <li className="px-2 py-2 text-sm text-muted">No transcript for this lecture.</li>}
          {q && visible.length === 0 && <li className="px-2 py-2 text-sm text-muted">No lines mention “{query.trim()}”.</li>}
          {visible.map(({ s, i }) => {
            const isActive = i === active;
            return (
              <li key={i} data-index={i}>
                <button
                  type="button"
                  onClick={() => playerBus.seek(s.startSec)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex w-full gap-3 rounded-md px-2 py-1 text-left text-sm leading-relaxed transition-colors ${
                    isActive ? "bg-accent-wash text-ink" : "text-muted hover:bg-hover hover:text-ink"
                  }`}
                >
                  <span className={`w-10 shrink-0 pt-px font-mono text-xs tabular-nums ${isActive ? "text-accent" : "text-faint"}`}>
                    {formatTime(s.startSec)}
                  </span>
                  <span>{highlight(s.text, q)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!following && !q && active >= 0 && (
          <button type="button" onClick={() => setPausedUntil(0)} className="btn btn-sm absolute right-3 bottom-3 shadow-float">
            ↓ Back to now
          </button>
        )}
      </div>
    </section>
  );
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded bg-warn-soft px-0.5 text-ink">{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
  }
  parts.push(text.slice(from));
  return parts;
}
