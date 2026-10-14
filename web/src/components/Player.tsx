import { useEffect, useRef } from "react";
import { frameUrl } from "../lib/api";
import { playerBus } from "../lib/playerBus";

export function Player({ lectureId, posterFrameId }: { lectureId: string; posterFrameId?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(
    () =>
      playerBus.onSeek((sec) => {
        const video = ref.current;
        if (!video) return;
        video.currentTime = sec;
        void video.play().catch(() => {}); // autoplay can be refused; the seek still happened
        // On a phone the player is above the fold of the tabs: bring it back into view.
        video.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }),
    [],
  );

  return (
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
  );
}
