import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LectureDetail } from "@lecture-lens/shared";
import { AskTab } from "../components/AskTab";
import { EditableText } from "../components/Editable";
import { ProcessingStatus } from "../components/LectureBits";
import { BlockTimes } from "../components/Markdown";
import { NotesEditor } from "../components/NotesEditor";
import { Player } from "../components/Player";
import { QuizTab } from "../components/QuizTab";
import { SummaryTab } from "../components/SummaryTab";
import { Transcript } from "../components/Transcript";
import { formatTime, getJSON, postWrite } from "../lib/api";
import { displayTitle, useModules, weekLabel } from "../lib/modules";
import { usePlayerTime } from "../lib/playerBus";

type Tab = "summary" | "ask" | "quiz" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "ask", label: "Ask" },
  { id: "quiz", label: "Quiz" },
  { id: "notes", label: "Notes" },
];

export function LectureView({ id }: { id: string }) {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["lecture", id],
    queryFn: () => getJSON<LectureDetail>(`/api/lectures/${id}`),
    refetchInterval: (q) => {
      const s = q.state.data?.lecture.status;
      return s && s !== "ready" && s !== "failed" ? 2000 : false;
    },
  });
  const { data: modules } = useModules();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("summary");
  const blockTimes = useMemo(() => new Map(data?.frames.map((f, i) => [f.id, i === 0 ? 0 : f.atSec])), [data]);

  if (isPending) return <p className="p-12 text-sm text-muted">Loading…</p>;
  if (error) return <p className="p-12 text-sm text-bad">{error.message}</p>;
  const { lecture, chapters } = data;
  const module = modules?.find((m) => m.id === lecture.moduleId);
  const rename = (title: string) =>
    postWrite(`/lectures/${lecture.id}`, { title }).then(() =>
      Promise.all([queryClient.invalidateQueries({ queryKey: ["lecture", id] }), queryClient.invalidateQueries({ queryKey: ["modules"] })]),
    );

  return (
    <BlockTimes.Provider value={blockTimes}>
      <div className="flex min-h-0 flex-1 flex-col xl:h-dvh">
        <nav aria-label="Breadcrumb" className="flex h-11 shrink-0 items-center gap-0.5 overflow-hidden px-3 text-sm whitespace-nowrap text-muted md:px-4">
          {module && (
            <Link href={`/modules/${module.id}`} className="truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-hover hover:text-ink">
              {module.name}
            </Link>
          )}
          <span className="text-faint">/</span>
          <span className="shrink-0 px-1.5">{weekLabel(lecture.week, module?.weeks)}</span>
          <span className="text-faint">/</span>
          <span className="truncate px-1.5 text-ink">{displayTitle(lecture)}</span>
        </nav>

        {lecture.status !== "ready" ? (
          <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
            <h1 className="display text-[2rem]">
              <EditableText label="Lecture title" value={displayTitle(lecture)} onSave={rename} />
            </h1>
            <div className="card mt-8 max-w-md p-4">
              <ProcessingStatus lecture={lecture} onChange={() => void refetch()} />
            </div>
            <p className="mt-4 text-sm text-muted">This page updates by itself; the lecture opens here when it’s ready.</p>
          </main>
        ) : (
          <div className="grid min-h-0 flex-1 gap-6 px-4 pb-4 md:px-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
            <section className="scroll-quiet flex min-w-0 flex-col pt-4 xl:min-h-0 xl:overflow-y-auto">
              <h1 className="display text-[1.75rem] md:text-[2rem]">
                <EditableText label="Lecture title" value={displayTitle(lecture)} onSave={rename} />
              </h1>
              <p className="mt-1.5 mb-5 text-sm text-muted">
                {lecture.durationSec ? `${formatTime(lecture.durationSec)} · ` : ""}
                {chapters.length} chapters
              </p>
              <Player lectureId={lecture.id} posterFrameId={data.frames[0]?.id} />
              <NowPlaying chapters={chapters} />
              <Transcript lectureId={lecture.id} className="mt-4 h-[42dvh] shrink-0 xl:h-auto xl:min-h-[240px] xl:flex-1" />
            </section>

            <section className="card flex min-h-[70dvh] flex-col overflow-hidden xl:min-h-0">
              <div role="tablist" className="flex gap-1 border-b border-line px-3">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`-mb-px border-b-2 px-2 py-2.5 text-sm ${
                      tab === t.id ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Tabs stay mounted so a streaming answer, a half-done quiz or a note survives switching tabs. */}
              <div className={`scroll-quiet min-h-0 flex-1 overflow-y-auto ${tab === "summary" ? "" : "hidden"}`}>
                <SummaryTab overview={lecture.summary} chapters={chapters} />
              </div>
              <div className={`min-h-0 flex-1 ${tab === "ask" ? "" : "hidden"}`}>
                <AskTab lectureId={lecture.id} chapters={chapters} />
              </div>
              <div className={`scroll-quiet min-h-0 flex-1 overflow-y-auto ${tab === "quiz" ? "" : "hidden"}`}>
                <QuizTab lectureId={lecture.id} chapters={chapters} />
              </div>
              <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${tab === "notes" ? "" : "hidden"}`}>
                <NotesEditor storageKey={`lecture:${lecture.id}`} withTimestamps placeholder="Your notes on this lecture. Stamp the video time to come back to a moment." />
              </div>
            </section>
          </div>
        )}
      </div>
    </BlockTimes.Provider>
  );
}

function NowPlaying({ chapters }: { chapters: LectureDetail["chapters"] }) {
  const time = usePlayerTime();
  const current = chapters.find((c) => time >= c.startSec && time < c.endSec);
  if (!current) return null;
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-muted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span className="font-mono text-xs tabular-nums">{formatTime(time)}</span>
      <span className="text-faint">·</span>
      <span className="truncate text-ink">{current.title}</span>
    </p>
  );
}
