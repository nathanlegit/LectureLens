import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Lecture, ModuleWithLectures } from "@lecture-lens/shared";
import { formatTime, getJSON } from "../lib/api";

export function ModuleList() {
  const { data: modules, error, isPending } = useQuery({
    queryKey: ["modules"],
    queryFn: () => getJSON<ModuleWithLectures[]>("/api/modules"),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Lecture Lens</h1>
      <p className="mt-1 text-sm text-stone-500">Ask your lecture recordings questions, with the board as the citation.</p>

      {isPending && <p className="mt-8 text-sm text-stone-500">Loading…</p>}
      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}
      {modules?.length === 0 && <p className="mt-8 text-sm text-stone-500">No modules yet.</p>}

      <div className="mt-8 space-y-6">
        {modules?.map((m) => (
          <section key={m.id} className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/50">
            <h2 className="border-b border-stone-200 px-4 py-3 font-medium dark:border-stone-800">{m.name}</h2>
            {m.lectures.length === 0 ? (
              <p className="px-4 py-3 text-sm text-stone-500">No lectures in this module yet.</p>
            ) : (
              <ul className="divide-y divide-stone-200 dark:divide-stone-800">
                {m.lectures.map((l) => (
                  <li key={l.id}>
                    <Link href={`/lectures/${l.id}`} className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                      <span className="min-w-0 truncate">{l.title}</span>
                      <LectureStatus lecture={l} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

function LectureStatus({ lecture }: { lecture: Lecture }) {
  if (lecture.status === "ready") {
    return <span className="shrink-0 font-mono text-xs text-stone-500">{lecture.durationSec ? formatTime(lecture.durationSec) : ""}</span>;
  }
  if (lecture.status === "failed") {
    return <span className="shrink-0 text-xs text-red-600">Failed at {lecture.failedStage}</span>;
  }
  return <span className="shrink-0 text-xs text-amber-600">Processing: {lecture.status}</span>;
}
