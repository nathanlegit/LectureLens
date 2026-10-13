import { useContext, useEffect, useState } from "react";
import { formatTime, frameUrl } from "../lib/api";
import { playerBus } from "../lib/playerBus";
import { BlockTimes } from "./Markdown";

/** Thumbnails of the frames an answer cites; click one to see it full size. */
export function FrameStrip({ lectureId, ids }: { lectureId: string; ids: string[] }) {
  const times = useContext(BlockTimes);
  const [open, setOpen] = useState<string | null>(null);
  const unique = [...new Set(ids)].filter((id) => times.has(id));
  if (unique.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {unique.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setOpen(id)}
            className="group relative shrink-0 overflow-hidden rounded-md ring-1 ring-line transition hover:ring-accent"
          >
            <img src={frameUrl(lectureId, id)} alt={`Frame at ${formatTime(times.get(id)!)}`} loading="lazy" className="h-16 w-auto" />
            <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
              {formatTime(times.get(id)!)}
            </span>
          </button>
        ))}
      </div>
      {open && <Lightbox lectureId={lectureId} id={open} sec={times.get(open)!} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ lectureId, id, sec, onClose }: { lectureId: string; id: string; sec: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <figure onClick={(e) => e.stopPropagation()} className="w-[min(92vw,1100px)]">
        <img src={frameUrl(lectureId, id)} alt={`Frame at ${formatTime(sec)}`} className="max-h-[80vh] w-[min(92vw,1100px)] rounded-ui object-contain" />
        <figcaption className="mt-3 flex items-center justify-between gap-3 text-sm text-white/80">
          <span className="font-mono">{formatTime(sec)}</span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                playerBus.seek(sec);
                onClose();
              }}
              className="rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:opacity-90"
            >
              Jump to {formatTime(sec)}
            </button>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 hover:bg-white/10">
              Close
            </button>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
