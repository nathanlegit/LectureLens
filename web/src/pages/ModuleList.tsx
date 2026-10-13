import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Lecture, ModuleWithLectures, Stage } from "@lecture-lens/shared";
import { formatTime, getJSON, postWrite, uploadLecture } from "../lib/api";

const STAGE_LABELS: Record<Stage | "queued", string> = {
  queued: "Waiting to start",
  ingest: "Preparing the video",
  transcribe: "Transcribing the audio",
  frames: "Finding the key moments",
  describe: "Reading the board",
  chapter: "Writing the chapters",
};

const isProcessing = (l: Lecture) => l.status !== "ready" && l.status !== "failed";

export function ModuleList() {
  const queryClient = useQueryClient();
  const { data: modules, error, isPending } = useQuery({
    queryKey: ["modules"],
    queryFn: () => getJSON<ModuleWithLectures[]>("/api/modules"),
    // Poll only while something is processing.
    refetchInterval: (q) => (q.state.data?.some((m) => m.lectures.some(isProcessing)) ? 2000 : false),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["modules"] });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Lecture Lens</h1>
      <p className="mt-1 text-sm text-stone-500">Ask your lecture recordings questions, with the board as the citation.</p>

      {isPending && <p className="mt-8 text-sm text-stone-500">Loading…</p>}
      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      <div className="mt-8 space-y-6">
        {modules?.map((m) => <ModuleCard key={m.id} module={m} onChange={refresh} />)}
      </div>

      {modules && <NewModule onCreated={refresh} empty={modules.length === 0} />}
    </main>
  );
}

function ModuleCard({ module: m, onChange }: { module: ModuleWithLectures; onChange: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ name: string; fraction: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onFile(file: File) {
    setUploadError(null);
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    setUpload({ name: file.name, fraction: 0 });
    try {
      await uploadLecture(m.id, file, title, (fraction) => setUpload({ name: file.name, fraction }));
      onChange();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUpload(null);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/50">
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="font-medium">{m.name}</h2>
        <button
          type="button"
          disabled={upload !== null}
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm transition hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-40 dark:border-stone-700 dark:hover:text-indigo-300"
        >
          Upload lecture
        </button>
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
      </header>

      {upload && (
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <p className="truncate text-sm">Uploading {upload.name}…</p>
          <Bar fraction={upload.fraction} />
        </div>
      )}
      {uploadError && (
        <p role="alert" className="border-b border-stone-200 px-4 py-3 text-sm text-red-600 dark:border-stone-800 dark:text-red-400">
          {uploadError}
        </p>
      )}

      {m.lectures.length === 0 && !upload ? (
        <p className="px-4 py-3 text-sm text-stone-500">No lectures in this module yet. Upload an MP4 recording to start.</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {m.lectures.map((l) => (
            <li key={l.id}>
              {l.status === "ready" ? (
                <Link href={`/lectures/${l.id}`} className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <span className="min-w-0 truncate">{l.title}</span>
                  <span className="shrink-0 font-mono text-xs text-stone-500">{l.durationSec ? formatTime(l.durationSec) : ""}</span>
                </Link>
              ) : (
                <ProcessingRow lecture={l} onRetried={onChange} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProcessingRow({ lecture: l, onRetried }: { lecture: Lecture; onRetried: () => void }) {
  const [retryError, setRetryError] = useState<string | null>(null);

  if (l.status === "failed") {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="min-w-0 truncate">{l.title}</span>
          <button
            type="button"
            onClick={() => {
              setRetryError(null);
              postWrite(`/lectures/${l.id}/retry`)
                .then(onRetried)
                .catch((err: Error) => setRetryError(err.message));
            }}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Retry
          </button>
        </div>
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
          Failed while {STAGE_LABELS[l.failedStage ?? "queued"].toLowerCase()}: {l.error}
        </p>
        {retryError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{retryError}</p>}
      </div>
    );
  }

  const label = STAGE_LABELS[l.status as Stage | "queued"];
  const fraction = l.stageTotal > 0 ? l.stageDone / l.stageTotal : null;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="min-w-0 truncate">{l.title}</span>
        <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
          {label}
          {l.status === "describe" && l.stageTotal > 0 ? ` ${l.stageDone}/${l.stageTotal}` : "…"}
        </span>
      </div>
      <Bar fraction={fraction} />
    </div>
  );
}

/** A progress bar; null shows an indeterminate pulse for stages that cannot report progress. */
function Bar({ fraction }: { fraction: number | null }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
      <div
        className={`h-full rounded-full bg-indigo-500 transition-[width] ${fraction === null ? "w-1/3 animate-pulse" : ""}`}
        style={fraction === null ? undefined : { width: `${Math.max(2, fraction * 100)}%` }}
      />
    </div>
  );
}

function NewModule({ onCreated, empty }: { onCreated: () => void; empty: boolean }) {
  const [open, setOpen] = useState(empty);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await postWrite("/modules", { name: name.trim() });
      setName("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the module");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-6 text-sm text-indigo-700 hover:underline dark:text-indigo-300">
        + New module
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Module name, e.g. MATH0005 Linear Algebra"
        aria-label="Module name"
        className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900"
      />
      <button type="submit" disabled={!name.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
        Create
      </button>
      {!empty && (
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
          Cancel
        </button>
      )}
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
