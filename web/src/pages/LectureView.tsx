import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LectureDetail } from "@lecture-lens/shared";
import { AskTab } from "../components/AskTab";
import { ProcessingStatus } from "../components/LectureBits";
import { BlockTimes } from "../components/Markdown";
import { NotesEditor } from "../components/NotesEditor";
import { Player } from "../components/Player";
import { QuizTab } from "../components/QuizTab";
import { SummaryTab } from "../components/SummaryTab";
import { formatTime, getJSON } from "../lib/api";
import { useModules, weekLabel } from "../lib/modules";
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
  const [tab, setTab] = useState<Tab>("summary");
  const blockTimes = useMemo(() => new Map(data?.frames.map((f, i) => [f.id, i === 0 ? 0 : f.atSec])), [data]);

  if (isPending) return <p className="p-12 text-sm text-muted">Loading…</p>;
  if (error) return <p className="p-12 text-sm text-bad">{error.message}</p>;
  const { lecture, chapters } = data;
  const module = modules?.find((m) => m.id === lecture.moduleId);

  return (
    <BlockTimes.Provider value={blockTimes}>
      <div className="flex min-h-0 flex-1 flex-col xl:h-dvh">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-hidden px-4 py-2.5 text-sm whitespace-nowrap text-muted md:px-6">
          {module && (
            <Link href={`/modules/${module.id}`} className="truncate rounded-ui px-1.5 py-0.5 hover:bg-hover">
              {module.name}
            </Link>
          )}
          <span className="text-faint">/</span>
          <span className="shrink-0 px-1.5">{weekLabel(lecture.week)}</span>
          <span className="text-faint">/</span>
          <span className="truncate px-1.5 text-ink">{lecture.title}</span>
        </nav>

        {lecture.status !== "ready" ? (
          <main className="mx-auto w-full max-w-3xl px-6 py-10">
            <h1 className="text-3xl font-bold tracking-tight">{lecture.title}</h1>
            <div className="mt-6 max-w-md">
              <ProcessingStatus lecture={lecture} onChange={() => void refetch()} />
            </div>
            <p className="mt-4 text-sm text-muted">This page updates by itself; the lecture opens here when it’s ready.</p>
          </main>
        ) : (
          <div className="grid min-h-0 flex-1 gap-6 px-4 pb-4 md:px-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
            <section className="min-w-0 xl:overflow-y-auto">
              <h1 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">{lecture.title}</h1>
              <p className="mb-4 text-sm text-muted">
                {lecture.durationSec ? formatTime(lecture.durationSec) : ""} · {chapters.length} chapters
              </p>
              <Player lectureId={lecture.id} posterFrameId={data.frames[0]?.id} />
              <NowPlaying chapters={chapters} />
            </section>

            <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-ui border border-line bg-surface xl:min-h-0">
              <div role="tablist" className="flex gap-1 border-b border-line px-2">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition ${
                      tab === t.id ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Tabs stay mounted so a streaming answer, a half-done quiz or a note survives switching tabs. */}
              <div className={`min-h-0 flex-1 overflow-y-auto ${tab === "summary" ? "" : "hidden"}`}>
                <SummaryTab overview={lecture.summary} chapters={chapters} />
              </div>
              <div className={`min-h-0 flex-1 ${tab === "ask" ? "" : "hidden"}`}>
                <AskTab lectureId={lecture.id} chapters={chapters} />
              </div>
              <div className={`min-h-0 flex-1 overflow-y-auto ${tab === "quiz" ? "" : "hidden"}`}>
                <QuizTab chapters={chapters} />
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
    <p className="mt-3 text-sm text-muted">
      <span className="font-mono">{formatTime(time)}</span> · {current.title}
    </p>
  );
}
