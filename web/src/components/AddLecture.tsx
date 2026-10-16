import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJSON } from "../lib/api";
import { Icon } from "./Brand";

/** Client-side guess at what a pasted link is; the server does the real (strict) check. */
export function linkKind(url: string): "YouTube video" | null {
  const u = url.trim().toLowerCase();
  if (/^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/.test(u)) return "YouTube video";
  return null;
}

/** "Add lecture": upload a file, or import from a YouTube link. */
export function AddLectureMenu({ disabled, onFile, onLink, compact = false }: { disabled?: boolean; onFile: () => void; onLink: () => void; compact?: boolean }) {
  const { data: features } = useQuery({
    queryKey: ["features"],
    queryFn: () => getJSON<{ linkImport: boolean }>("/api/features"),
    staleTime: Infinity,
  });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  // No link import on this server (the deployed one): skip the menu and pick a file directly.
  const toggle = () => (features?.linkImport ? setOpen((o) => !o) : onFile());

  return (
    <div ref={root} className="relative">
      {compact ? (
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-faint transition-colors hover:bg-hover hover:text-muted disabled:opacity-40"
        >
          <Icon.plus className="h-4 w-4" /> Add a recording
        </button>
      ) : (
        <button type="button" disabled={disabled} onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="btn btn-ghost btn-sm">
          <Icon.upload className="h-3.5 w-3.5" /> Add lecture
        </button>
      )}
      {open && (
        <div role="menu" className={`card anim-pop absolute z-30 mt-1 w-72 p-1 shadow-float ${compact ? "origin-tl left-0" : "origin-tr right-0"}`}>
          <button type="button" role="menuitem" onClick={pick(onFile)} className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover">
            <Icon.upload className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>
              <span className="block text-sm font-medium">Upload a video file</span>
              <span className="block text-xs text-muted">MP4 or another common format, from your computer</span>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={pick(onLink)} className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover">
            <Icon.play className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>
              <span className="block text-sm font-medium">Paste a YouTube link</span>
              <span className="block text-xs text-muted">A public or unlisted video, up to 95 minutes</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** A small modal for importing from a link. onSubmit may throw; its message is shown in the dialog. */
export function LinkDialog({ weekName, onClose, onSubmit }: { weekName: string; onClose: () => void; onSubmit: (url: string, title: string) => Promise<unknown> }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = linkKind(url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!kind || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(url.trim(), title.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that link");
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="link-dialog-title" className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[15vh]">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="card anim-pop relative w-full max-w-md p-5 shadow-window" style={{ animationDuration: "var(--ll-dur-slow)" }}>
        <h2 id="link-dialog-title" className="font-semibold tracking-tight">
          Import from YouTube
        </h2>
        <p className="mt-1 text-sm text-muted">Into {weekName}. It downloads, then goes through the same steps as an upload.</p>

        <label htmlFor="link-url" className="mt-4 block text-xs font-medium text-muted">
          YouTube link
        </label>
        <input
          id="link-url"
          autoFocus
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://www.youtube.com/watch?v=…"
          className="field mt-1.5 w-full"
        />
        <p className={`mt-1.5 text-xs ${kind ? "text-ok" : "text-faint"}`}>
          {kind ? `✓ ${kind}` : url.trim() ? "That doesn’t look like a YouTube video link." : "A public or unlisted video, up to 95 minutes."}
        </p>

        <label htmlFor="link-title" className="mt-3 block text-xs font-medium text-muted">
          Title <span className="font-normal text-faint">(optional: uses the video’s own name)</span>
        </label>
        <input id="link-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lecture 3: Eigenvalues" className="field mt-1.5 w-full" />

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!kind || busy} className="btn btn-primary">
            {busy ? "Adding…" : "Import"}
          </button>
        </div>
      </form>
    </div>
  );
}
