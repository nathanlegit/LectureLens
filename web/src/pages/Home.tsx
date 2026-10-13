import { useState } from "react";
import { Link, useSearch } from "wouter";
import type { Lecture, ModuleWithLectures } from "@lecture-lens/shared";
import { ModuleIcon } from "../components/AppShell";
import { NewModuleForm } from "../components/LectureBits";
import { formatTime, frameUrl } from "../lib/api";
import { useModules, weekLabel } from "../lib/modules";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const { data: modules, error, isPending } = useModules();
  const search = useSearch();
  const [creating, setCreating] = useState(search.includes("new=module"));

  const lectures = (modules ?? []).flatMap((m) => m.lectures.map((l) => ({ ...l, moduleName: m.name })));
  const recent = lectures
    .filter((l) => l.status === "ready")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 md:px-12">
      <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
      <p className="mt-2 text-muted">Ask your lecture recordings anything. Answers cite the board, and every citation jumps the video there.</p>

      {isPending && <p className="mt-10 text-sm text-muted">Loading…</p>}
      {error && <p className="mt-10 text-sm text-bad">{error.message}</p>}

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-sm font-medium text-muted">Recently added</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((l) => (
              <LectureCard key={l.id} lecture={l} moduleName={l.moduleName} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Modules</h2>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className="rounded-ui px-2 py-1 text-sm text-muted hover:bg-hover">
              + New module
            </button>
          )}
        </div>
        {creating && (
          <div className="mb-4">
            <NewModuleForm onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
          </div>
        )}
        {modules?.length === 0 && !creating && (
          <p className="text-sm text-muted">
            No modules yet.{" "}
            <button type="button" className="text-accent hover:underline" onClick={() => setCreating(true)}>
              Create your first module
            </button>
            , then upload a lecture recording into it.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {modules?.map((m) => <ModuleCard key={m.id} module={m} />)}
        </div>
      </section>
    </main>
  );
}

function LectureCard({ lecture: l, moduleName }: { lecture: Lecture; moduleName: string }) {
  return (
    <Link href={`/lectures/${l.id}`} className="group overflow-hidden rounded-ui border border-line bg-surface transition hover:shadow-md">
      <div className="aspect-video overflow-hidden bg-hover">
        {l.thumbFrameId && (
          <img src={frameUrl(l.id, l.thumbFrameId)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium">{l.title}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {moduleName} · {weekLabel(l.week)}
          {l.durationSec ? ` · ${formatTime(l.durationSec)}` : ""}
        </p>
      </div>
    </Link>
  );
}

function ModuleCard({ module: m }: { module: ModuleWithLectures }) {
  const weeks = new Set(m.lectures.map((l) => l.week).filter((w) => w !== null)).size;
  return (
    <Link href={`/modules/${m.id}`} className="flex items-center gap-3 rounded-ui border border-line bg-surface p-3 transition hover:bg-hover">
      <ModuleIcon name={m.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{m.name}</span>
        <span className="block text-xs text-muted">
          {m.lectures.length} lecture{m.lectures.length === 1 ? "" : "s"}
          {weeks > 0 ? ` · ${weeks} week${weeks === 1 ? "" : "s"}` : ""}
        </span>
      </span>
    </Link>
  );
}
