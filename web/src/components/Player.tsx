import { useEffect, useRef, useState } from "react";
import { formatTime, frameUrl } from "../lib/api";
import { playerBus } from "../lib/playerBus";

export function Player({ lectureId, posterFrameId }: { lectureId: string; posterFrameId?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Each jump (from a chip, chapter, transcript line or quiz) shows a brief "▶ 12:41" toast and a
  // ring pulse, so the reader sees the jump happened. n re-keys them so repeated jumps replay.
  const [jump, setJump] = useState<{ sec: number; n: number } | null>(null);

  useEffect(
    () =>
      playerBus.onSeek((sec) => {
        const video = ref.current;
        if (!video) return;
        video.currentTime = sec;
        void video.play().catch(() => {}); // autoplay can be refused; the seek still happened
        // On a phone the player is above the fold of the tabs: bring it back into view.
        video.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setJump((j) => ({ sec, n: (j?.n ?? 0) + 1 }));
      }),
    [],
  );

  useEffect(() => {
    if (!jump) return;
    const t = window.setTimeout(() => setJump(null), 1400);
    return () => window.clearTimeout(t);
  }, [jump]);

  return (
    <div className="relative">
      <video
        ref={ref}
        src={`/media/${lectureId}/video`}
        poster={posterFrameId ? frameUrl(lectureId, posterFrameId) : undefined}
        controls
        preload="metadata"
        playsInline
        onTimeUpdate={(e) => playerBus.reportTime(e.currentTarget.currentTime)}
        className="aspect-video w-full rounded-xl bg-black"
      >
        <track kind="captions" src={`/api/lectures/${lectureId}/captions.vtt`} srcLang="en" label="English" default />
      </video>
      {/* Only the overlay is keyed by n: keying the wrapper would remount (and reload) the video. */}
      {jump && <span key={`ring-${jump.n}`} aria-hidden className="anim-ring pointer-events-none absolute inset-0 rounded-xl" />}
      {jump && (
        <span
          key={`toast-${jump.n}`}
          role="status"
          className="anim-pop pointer-events-none absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 font-mono text-xs text-white tabular-nums shadow-float backdrop-blur-sm"
        >
          ▶ {formatTime(jump.sec)}
        </span>
      )}
    </div>
  );
}
