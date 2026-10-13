import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import type { Lecture, Stage } from "@lecture-lens/shared";
import { postWrite } from "../lib/api";

export const STAGE_LABELS: Record<Stage | "queued", string> = {
  queued: "Waiting to start",
  ingest: "Preparing the video",
  transcribe: "Transcribing the audio",
  frames: "Finding the key moments",
  describe: "Reading the board",
  chapter: "Writing the chapters",
};

/** Live status for a lecture that is processing or failed. */
export function ProcessingStatus({ lecture: l, onChange }: { lecture: Lecture; onChange: () => void }) {
  const [retryError, setRetryError] = useState<string | null>(null);

  if (l.status === "failed") {
    return (
      <div>
        <p className="text-sm text-bad">
          Failed while {STAGE_LABELS[l.failedStage ?? "queued"].toLowerCase()}: {l.error}
        </p>
        <button
          type="button"
          onClick={() => {
            setRetryError(null);
            postWrite(`/lectures/${l.id}/retry`)
              .then(onChange)
              .catch((err: Error) => setRetryError(err.message));
          }}
          className="mt-2 rounded-ui bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:opacity-90"
        >
          Retry
        </button>
        {retryError && <p className="mt-1 text-sm text-bad">{retryError}</p>}
      </div>
    );
  }

  const label = STAGE_LABELS[l.status as Stage | "queued"];
  const fraction = l.stageTotal > 0 ? l.stageDone / l.stageTotal : null;
  return (
    <div>
      <p className="text-xs text-warn">
        {label}
        {l.status === "describe" && l.stageTotal > 0 ? ` ${l.stageDone}/${l.stageTotal}` : "…"}
      </p>
      <Bar fraction={fraction} />
    </div>
  );
}

/** A progress bar; null shows an indeterminate pulse for stages that cannot report progress. */
export function Bar({ fraction }: { fraction: number | null }) {
  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hover">
      <div
        className={`h-full rounded-full bg-accent transition-[width] ${fraction === null ? "w-1/3 animate-pulse" : ""}`}
        style={fraction === null ? undefined : { width: `${Math.max(2, fraction * 100)}%` }}
      />
    </div>
  );
}

export function DeleteLectureButton({ lecture, onDeleted, className = "" }: { lecture: Lecture; onDeleted: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Delete ${lecture.title}`}
      onClick={() => {
        if (!window.confirm(`Delete “${lecture.title}”? Its video, transcript, chat and quizzes are removed.`)) return;
        postWrite(`/lectures/${lecture.id}/delete`)
          .then(onDeleted)
          .catch((err: Error) => window.alert(err.message));
      }}
      className={`rounded-ui px-2 py-1 text-xs text-faint hover:bg-bad-soft hover:text-bad ${className}`}
    >
      Delete
    </button>
  );
}

/** Moves a lecture to another week (or none). */
export function WeekSelect({ lecture, maxWeek, onMoved }: { lecture: Lecture; maxWeek: number; onMoved: () => void }) {
  const weeks = Array.from({ length: Math.max(maxWeek + 1, 12) }, (_, i) => i + 1);
  return (
    <select
      aria-label={`Week for ${lecture.title}`}
      value={lecture.week ?? ""}
      onChange={(e) => {
        const week = e.target.value === "" ? null : Number(e.target.value);
        postWrite(`/lectures/${lecture.id}`, { week })
          .then(onMoved)
          .catch((err: Error) => window.alert(err.message));
      }}
      className="rounded-ui bg-transparent px-1 py-0.5 text-xs text-faint hover:bg-hover"
    >
      <option value="">No week</option>
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week {w}
        </option>
      ))}
    </select>
  );
}

export function NewModuleForm({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const m = await postWrite<{ id: string }>("/modules", { name: name.trim() });
      onDone?.();
      navigate(`/modules/${m.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the module");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Module name, e.g. MATH0005 Linear Algebra"
        aria-label="Module name"
        className="min-w-0 flex-1 rounded-ui border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button type="submit" disabled={!name.trim()} className="rounded-ui bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-40">
        Create
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded-ui px-2 py-2 text-sm text-muted hover:bg-hover">
          Cancel
        </button>
      )}
      {error && <p className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}
