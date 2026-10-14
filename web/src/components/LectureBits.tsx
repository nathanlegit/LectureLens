import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import type { Lecture, Stage, WeekInfo } from "@lecture-lens/shared";
import { postWrite } from "../lib/api";
import { weekLabel } from "../lib/modules";

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
          className="btn btn-sm mt-2"
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
      <p className="text-xs text-muted">
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
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-press">
      <div
        className={`h-full rounded-full bg-primary transition-[width] duration-500 ${fraction === null ? "w-1/3 animate-pulse" : ""}`}
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
      className={`rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-bad-soft hover:text-bad ${className}`}
    >
      Delete
    </button>
  );
}

/** Moves a lecture to one of the module's weeks, a new week, or none. */
export function WeekSelect({ lecture, weeks, onMoved }: { lecture: Lecture; weeks: WeekInfo[]; onMoved: () => void }) {
  const numbers = [...new Set([...weeks.map((w) => w.week), ...(lecture.week !== null ? [lecture.week] : [])])].sort((a, b) => a - b);
  const next = Math.max(0, ...numbers) + 1;
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
      className="rounded-md bg-transparent px-1 py-1 text-xs text-muted transition-colors hover:bg-press"
    >
      <option value="">No week</option>
      {numbers.map((w) => (
        <option key={w} value={w}>
          {weekLabel(w, weeks)}
        </option>
      ))}
      <option value={next}>+ New week ({next})</option>
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
        className="field min-w-0 flex-1"
      />
      <button type="submit" disabled={!name.trim()} className="btn btn-primary">
        Create
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      )}
      {error && <p className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}
