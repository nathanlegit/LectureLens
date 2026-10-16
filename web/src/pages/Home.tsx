import { useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import type { Lecture, ModuleWithLectures } from "@lecture-lens/shared";
import { ModuleIcon } from "../components/AppShell";
import { Icon } from "../components/Brand";
import { NewModuleForm } from "../components/LectureBits";
import { formatTime, frameUrl } from "../lib/api";
import { displayTitle, useModules, weekLabel } from "../lib/modules";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const { data: modules, error, isPending } = useModules();
  const search = useSearch();
  const [creating, setCreating] = useState(search.includes("new=module"));

  const lectures = (modules ?? []).flatMap((m) => m.lectures.map((l) => ({ ...l, moduleName: m.name, weekName: weekLabel(l.week, m.weeks) })));
  const recent = lectures
    .filter((l) => l.status === "ready")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const processing = lectures.filter((l) => l.status !== "ready" && l.status !== "failed").length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-20 sm:px-6 md:px-12 md:pt-20">
      <h1 className="display text-[2rem] md:text-[2.5rem]">{greeting()}</h1>
      <p className="mt-2 text-muted">
        {modules && modules.length > 0 ? (
          <>
            {modules.length} module{modules.length === 1 ? "" : "s"} · {lectures.length} lecture{lectures.length === 1 ? "" : "s"}
            {processing > 0 && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-warn">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
                {processing} processing
              </span>
            )}
          </>
        ) : (
          "Ask your lecture recordings anything. Answers cite the board, and every citation jumps the video there."
        )}
      </p>

      {isPending && <p className="mt-10 text-sm text-muted">Loading…</p>}
      {error && <p className="mt-10 text-sm text-bad">{error.message}</p>}

      {recent.length > 0 && (
        <section className="mt-12">
          <SectionLabel icon={<Icon.clock className="h-3.5 w-3.5" />}>Recently added</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((l) => (
              <LectureCard key={l.id} lecture={l} moduleName={l.moduleName} weekName={l.weekName} />
            ))}
          </div>
        </section>
      )}

      <section className={`mt-12 ${isPending ? "hidden" : ""}`}>
        <div className="flex items-center justify-between">
          <SectionLabel icon={<Icon.folder className="h-3.5 w-3.5" />}>Modules</SectionLabel>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className="btn btn-ghost btn-sm -mt-3">
              <Icon.plus className="h-3.5 w-3.5" /> New module
            </button>
          )}
        </div>
        {creating && (
          <div className="card mb-4 p-3">
            <NewModuleForm onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
          </div>
        )}
        {modules?.length === 0 && !creating && (
          <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="font-medium">No modules yet</p>
            <p className="mt-1 text-sm text-muted">Create a module, then upload a lecture recording into it.</p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => setCreating(true)}>
              <Icon.plus className="h-4 w-4" /> New module
            </button>
          </div>
        )}
        {modules && modules.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-line">
            {modules.map((m) => (
              <ModuleRow key={m.id} module={m} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
      {icon}
      {children}
    </h2>
  );
}

function LectureCard({ lecture: l, moduleName, weekName }: { lecture: Lecture; moduleName: string; weekName: string }) {
  return (
    <Link href={`/lectures/${l.id}`} className="card group overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-sand">
        {l.thumbFrameId && <img src={frameUrl(l.id, l.thumbFrameId)} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {l.durationSec ? (
          <span className="absolute right-2 bottom-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[11px] text-white tabular-nums backdrop-blur-sm">
            {formatTime(l.durationSec)}
          </span>
        ) : null}
      </div>
      <div className="px-3.5 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{displayTitle(l)}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {moduleName} · {weekName}
        </p>
      </div>
    </Link>
  );
}

function ModuleRow({ module: m }: { module: ModuleWithLectures }) {
  const weeks = new Set(m.lectures.map((l) => l.week).filter((w) => w !== null)).size;
  return (
    <Link href={`/modules/${m.id}`} className="group flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-hover">
      <ModuleIcon name={m.name} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{m.name}</span>
        <span className="block text-xs text-muted">
          {m.lectures.length} lecture{m.lectures.length === 1 ? "" : "s"}
          {weeks > 0 ? ` · ${weeks} week${weeks === 1 ? "" : "s"}` : ""}
        </span>
      </span>
      <Icon.chevron className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
