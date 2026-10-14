import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import type { Lecture, WeekInfo } from "@lecture-lens/shared";
import { LectureDot, ModuleIcon } from "../components/AppShell";
import { Icon } from "../components/Brand";
import { EditableText, MoreMenu } from "../components/Editable";
import { Bar, DeleteLectureButton, ProcessingStatus, WeekSelect } from "../components/LectureBits";
import { NotesEditor } from "../components/NotesEditor";
import { formatTime, postWrite, uploadLecture } from "../lib/api";
import { defaultWeekLabel, groupWeeks, isProcessing, useModules, useRefreshModules } from "../lib/modules";

interface Upload {
  week: number | null;
  name: string;
  fraction: number;
}

export function ModulePage({ id }: { id: string }) {
  const { data: modules, isPending } = useModules();
  const refresh = useRefreshModules();
  const [, navigate] = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [targetWeek, setTargetWeek] = useState<number | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [renamingWeek, setRenamingWeek] = useState<number | null>(null);

  const m = modules?.find((x) => x.id === id);
  if (isPending) return <p className="p-12 text-sm text-muted">Loading…</p>;
  if (!m) return <p className="p-12 text-sm text-muted">This module doesn’t exist.</p>;

  const groups = groupWeeks(m);
  if (groups.length === 0) groups.push({ week: 1, label: defaultWeekLabel(1), lectures: [] });
  const nextWeek = Math.max(0, ...groups.map((g) => g.week ?? 0)) + 1;
  const busy = m.lectures.some(isProcessing);

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

  const act = (p: Promise<unknown>) => p.then(refresh).catch((err: Error) => window.alert(err.message));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-20 sm:px-6 md:px-12 md:pt-20">
      <div className="flex items-start justify-between gap-3">
        <ModuleIcon name={m.name} size="lg" />
        <MoreMenu
          label="Module actions"
          items={[
            {
              label: "Delete module",
              danger: true,
              onSelect: () => {
                if (busy) return window.alert("A lecture in this module is still processing. Wait for it to finish first.");
                const n = m.lectures.length;
                if (!window.confirm(`Delete “${m.name}”${n ? ` and its ${n} lecture${n === 1 ? "" : "s"}` : ""}? This can’t be undone.`)) return;
                postWrite(`/modules/${m.id}/delete`)
                  .then(() => refresh())
                  .then(() => navigate("/library"))
                  .catch((err: Error) => window.alert(err.message));
              },
            },
          ]}
        />
      </div>
      <h1 className="display mt-5 text-[2rem] md:text-[2.5rem]">
        <EditableText label="Module name" value={m.name} onSave={(name) => postWrite(`/modules/${m.id}`, { name }).then(refresh)} />
      </h1>
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
        {groups.map(({ week, label, lectures }) => (
          <section key={String(week)}>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-1.5">
              <h2 className="min-w-0 flex-1 font-semibold tracking-tight">
                {week === null ? (
                  label
                ) : (
                  <EditableText
                    label="Week name"
                    value={label}
                    placeholder={defaultWeekLabel(week)}
                    allowEmpty
                    editing={renamingWeek === week}
                    onEditingChange={(e) => setRenamingWeek(e ? week : null)}
                    // An empty name, or the default one, resets it to "Week N".
                    onSave={(title) => postWrite(`/modules/${m.id}/weeks/${week}`, { title: title === defaultWeekLabel(week) ? null : title || null }).then(refresh)}
                  />
                )}
              </h2>
              <span className="flex shrink-0 items-center gap-0.5">
                <button type="button" disabled={upload !== null} onClick={() => pick(week)} className="btn btn-ghost btn-sm">
                  <Icon.upload className="h-3.5 w-3.5" /> Add lecture
                </button>
                {week !== null && (
                  <MoreMenu
                    label={`Actions for ${label}`}
                    items={[
                      { label: "Rename week", onSelect: () => setRenamingWeek(week) },
                      {
                        label: "Delete week",
                        danger: true,
                        onSelect: () => {
                          const n = lectures.length;
                          const msg = n
                            ? `Delete “${label}”? Its ${n} lecture${n === 1 ? "" : "s"} will move to “No week”; nothing else is deleted.`
                            : `Delete “${label}”?`;
                          if (window.confirm(msg)) void act(postWrite(`/modules/${m.id}/weeks/${week}/delete`));
                        },
                      },
                    ]}
                  />
                )}
              </span>
            </div>
            <ul className="mt-1">
              {lectures.map((l) => (
                <LectureRow key={l.id} lecture={l} weeks={m.weeks} onChange={refresh} />
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
        <button
          type="button"
          onClick={() => void act(postWrite(`/modules/${m.id}/weeks/${nextWeek}`, {}).then(() => setRenamingWeek(nextWeek)))}
          className="btn btn-ghost btn-sm -ml-2"
        >
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

function LectureRow({ lecture: l, weeks, onChange }: { lecture: Lecture; weeks: WeekInfo[]; onChange: () => void }) {
  const ready = l.status === "ready";
  const [renaming, setRenaming] = useState(false);
  const rename = (title: string) => postWrite(`/lectures/${l.id}`, { title }).then(onChange);

  return (
    <li className="group flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-hover">
      <span className="mt-[5px] flex w-4 shrink-0 justify-center text-muted">
        <LectureDot lecture={l} />
      </span>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <EditableText label="Lecture title" value={l.title} onSave={rename} editing onEditingChange={setRenaming} className="text-[15px]" />
        ) : ready ? (
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
        <button type="button" onClick={() => setRenaming(true)} className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-press">
          Rename
        </button>
        <WeekSelect lecture={l} weeks={weeks} onMoved={onChange} />
        {!isProcessing(l) && <DeleteLectureButton lecture={l} onDeleted={onChange} />}
      </span>
    </li>
  );
}
