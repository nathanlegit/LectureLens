import { useRef, useState } from "react";
import { Link } from "wouter";
import type { Lecture } from "@lecture-lens/shared";
import { LectureDot, ModuleIcon } from "../components/AppShell";
import { Icon } from "../components/Brand";
import { Bar, DeleteLectureButton, ProcessingStatus, WeekSelect } from "../components/LectureBits";
import { NotesEditor } from "../components/NotesEditor";
import { formatTime, uploadLecture } from "../lib/api";
import { groupByWeek, isProcessing, useModules, useRefreshModules, weekLabel } from "../lib/modules";

interface Upload {
  week: number | null;
  name: string;
  fraction: number;
}

export function ModulePage({ id }: { id: string }) {
  const { data: modules, isPending } = useModules();
  const refresh = useRefreshModules();
  const fileInput = useRef<HTMLInputElement>(null);
  const [targetWeek, setTargetWeek] = useState<number | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extraWeeks, setExtraWeeks] = useState<number[]>([]);

  const m = modules?.find((x) => x.id === id);
  if (isPending) return <p className="p-12 text-sm text-muted">Loading…</p>;
  if (!m) return <p className="p-12 text-sm text-muted">This module doesn’t exist.</p>;

  const groups = groupByWeek(m.lectures);
  const used = new Set(groups.map((g) => g.week));
  for (const w of extraWeeks) if (!used.has(w)) groups.push({ week: w, lectures: [] });
  if (groups.length === 0) groups.push({ week: 1, lectures: [] });
  groups.sort((a, b) => (a.week === null ? 1 : b.week === null ? -1 : a.week - b.week));
  const maxWeek = Math.max(0, ...groups.map((g) => g.week ?? 0));

  const pick = (week: number | null) => {
    setTargetWeek(week);
    fileInput.current?.click();
  };

  async function onFile(file: File) {
    setUploadError(null);
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    setUpload({ week: targetWeek, name: file.name, fraction: 0 });
    try {
      await uploadLecture(m!.id, file, title, targetWeek, (fraction) => setUpload({ week: targetWeek, name: file.name, fraction }));
      await refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUpload(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-20 sm:px-6 md:px-12 md:pt-20">
      <ModuleIcon name={m.name} size="lg" />
      <h1 className="display mt-5 text-[2rem] md:text-[2.5rem]">{m.name}</h1>
      <p className="mt-2 text-muted">
        {m.lectures.length} lecture{m.lectures.length === 1 ? "" : "s"} · Add a recording to a week and it’s transcribed, read and chaptered in a few minutes.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />
      {uploadError && (
        <p role="alert" className="mt-6 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {uploadError}
        </p>
      )}

      <div className="mt-10 space-y-8">
        {groups.map(({ week, lectures }) => (
          <section key={String(week)}>
            <div className="group/head flex items-center justify-between gap-3 border-b border-line pb-1.5">
              <h2 className="font-semibold tracking-tight">{weekLabel(week)}</h2>
              <button type="button" disabled={upload !== null} onClick={() => pick(week)} className="btn btn-ghost btn-sm">
                <Icon.upload className="h-3.5 w-3.5" /> Add lecture
              </button>
            </div>
            <ul className="mt-1">
              {lectures.map((l) => (
                <LectureRow key={l.id} lecture={l} maxWeek={maxWeek} onChange={refresh} />
              ))}
              {upload && upload.week === week && (
                <li className="px-2 py-2.5">
                  <p className="truncate text-sm">Uploading {upload.name}…</p>
                  <Bar fraction={upload.fraction} />
                </li>
              )}
              {lectures.length === 0 && !(upload && upload.week === week) && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick(week)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-faint transition-colors hover:bg-hover hover:text-muted"
                  >
                    <Icon.plus className="h-4 w-4" /> Upload a recording
                  </button>
                </li>
              )}
            </ul>
          </section>
        ))}
        <button type="button" onClick={() => setExtraWeeks((w) => [...w, maxWeek + 1])} className="btn btn-ghost btn-sm -ml-2">
          <Icon.plus className="h-3.5 w-3.5" /> New week
        </button>
      </div>

      <section className="mt-14">
        <h2 className="border-b border-line pb-1.5 font-semibold tracking-tight">Notes</h2>
        <div className="mt-3">
          <NotesEditor storageKey={`module:${m.id}`} placeholder="Module notes: deadlines, what to revise, questions for the lecturer…" />
        </div>
      </section>
    </main>
  );
}

function LectureRow({ lecture: l, maxWeek, onChange }: { lecture: Lecture; maxWeek: number; onChange: () => void }) {
  const ready = l.status === "ready";
  return (
    <li className="group flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-hover">
      <span className="mt-[5px] flex w-4 shrink-0 justify-center text-muted">
        <LectureDot lecture={l} />
      </span>
      <div className="min-w-0 flex-1">
        {ready ? (
          <Link href={`/lectures/${l.id}`} className="flex items-center justify-between gap-4">
            <span className="truncate text-[15px]">{l.title}</span>
            <span className="shrink-0 font-mono text-xs text-faint tabular-nums">{l.durationSec ? formatTime(l.durationSec) : ""}</span>
          </Link>
        ) : (
          <>
            <span className="block truncate text-[15px]">{l.title}</span>
            <ProcessingStatus lecture={l} onChange={onChange} />
          </>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <WeekSelect lecture={l} maxWeek={maxWeek} onMoved={onChange} />
        {!isProcessing(l) && <DeleteLectureButton lecture={l} onDeleted={onChange} />}
      </span>
    </li>
  );
}
