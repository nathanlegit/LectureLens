import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LectureDetail } from "@lecture-lens/shared";
import { AskTab } from "../components/AskTab";
import { BlockTimes } from "../components/Markdown";
import { OutlineTab } from "../components/OutlineTab";
import { Player } from "../components/Player";
import { formatTime, getJSON } from "../lib/api";
import { usePlayerTime } from "../lib/playerBus";

type Tab = "outline" | "ask";
const TABS: { id: Tab; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "ask", label: "Ask" },
];

export function LectureView({ id }: { id: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["lecture", id],
    queryFn: () => getJSON<LectureDetail>(`/api/lectures/${id}`),
  });
  const [tab, setTab] = useState<Tab>("outline");
  const blockTimes = useMemo(() => new Map(data?.frames.map((f) => [f.id, f.id === data.frames[0]?.id ? 0 : f.atSec])), [data]);

  if (isPending) return <p className="p-6 text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="p-6 text-sm text-red-600">{error.message}</p>;
  const { lecture, chapters } = data;

  return (
    <BlockTimes.Provider value={blockTimes}>
      <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-4 lg:h-dvh lg:px-6">
        <header className="mb-4 flex items-baseline gap-3">
          <Link href="/" className="shrink-0 text-sm whitespace-nowrap text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
            ← Modules
          </Link>
          <h1 className="min-w-0 truncate text-lg font-semibold">{lecture.title}</h1>
        </header>

        {lecture.status !== "ready" ? (
          <p className="text-sm text-stone-500">This lecture is still processing ({lecture.status}).</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
            <section className="min-w-0">
              <Player lectureId={lecture.id} posterFrameId={data.frames[0]?.id} />
              <NowPlaying chapters={chapters} />
            </section>

            <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white lg:min-h-0 dark:border-stone-800 dark:bg-stone-900/50">
              <div role="tablist" className="flex border-b border-stone-200 dark:border-stone-800">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                      tab === t.id
                        ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                        : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Both tabs stay mounted so a streaming answer survives a switch to the outline. */}
              <div className={`min-h-0 flex-1 overflow-y-auto ${tab === "outline" ? "" : "hidden"}`}>
                <OutlineTab chapters={chapters} />
              </div>
              <div className={`min-h-0 flex-1 ${tab === "ask" ? "" : "hidden"}`}>
                <AskTab lectureId={lecture.id} chapters={chapters} />
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
    <p className="mt-3 text-sm text-stone-500">
      <span className="font-mono">{formatTime(time)}</span> · {current.title}
    </p>
  );
}
