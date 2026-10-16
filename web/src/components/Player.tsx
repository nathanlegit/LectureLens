import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Chapter, Frame } from "@lecture-lens/shared";
import { formatTime, frameUrl } from "../lib/api";
import { playerBus } from "../lib/playerBus";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const PREFS_KEY = "lecture-lens-player";
const HIDE_AFTER_MS = 2400;

interface Prefs {
  speed: number;
  volume: number;
  muted: boolean;
  captions: boolean;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { speed: 1, volume: 1, muted: false, captions: true };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // not remembered; fine
  }
}

/** The frame on screen at `sec`: the last one captured at or before it. */
function frameAt(frames: Pick<Frame, "id" | "atSec">[], sec: number) {
  let lo = 0;
  let hi = frames.length - 1;
  let found = frames[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.atSec <= sec) {
      found = frames[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * The lecture's video with controls in the app's own style: a scrubber with chapter breaks that
 * previews the board at any moment, speed, captions, volume and fullscreen, plus keyboard
 * shortcuts while it has focus. The progress bar is driven per frame through refs, so playback
 * itself causes no React re-renders.
 */
export function Player({
  lectureId,
  posterFrameId,
  chapters = [],
  frames = [],
}: {
  lectureId: string;
  posterFrameId?: string;
  chapters?: Pick<Chapter, "id" | "title" | "startSec">[];
  frames?: Pick<Frame, "id" | "atSec">[];
}) {
  const shell = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [second, setSecond] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [visible, setVisible] = useState(true);
  const [hover, setHover] = useState<{ x: number; sec: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [jump, setJump] = useState<{ sec: number; n: number } | null>(null);
  const hideTimer = useRef<number>(0);

  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p };
      savePrefs(next);
      return next;
    });

  // Apply preferences to the element.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = prefs.speed;
    v.volume = prefs.volume;
    v.muted = prefs.muted;
    const track = v.textTracks[0];
    if (track) track.mode = prefs.captions ? "showing" : "hidden";
  }, [prefs]);

  // Progress bar at 60 fps without re-rendering: write widths straight to the DOM.
  const paint = useCallback((sec: number) => {
    const d = video.current?.duration || 0;
    const pct = d ? Math.min(100, (sec / d) * 100) : 0;
    if (fill.current) fill.current.style.width = `${pct}%`;
    if (knob.current) knob.current.style.left = `${pct}%`;
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const v = video.current;
      if (v && !scrubbing) paint(v.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, scrubbing, paint]);

  // Controls fade out while playing and the pointer is still; they stay while paused.
  const poke = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!video.current?.paused) setVisible(false);
    }, HIDE_AFTER_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (!playing) setVisible(true);
    else poke();
  }, [playing, poke]);

  const seekTo = useCallback(
    (sec: number) => {
      const v = video.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(sec, v.duration || sec));
      paint(v.currentTime);
      setSecond(Math.floor(v.currentTime));
    },
    [paint],
  );

  // Seeks from elsewhere (citation chips, chapters, transcript, quiz) play from there and show a toast.
  useEffect(
    () =>
      playerBus.onSeek((sec) => {
        const v = video.current;
        if (!v) return;
        seekTo(sec);
        void v.play().catch(() => {}); // autoplay can be refused; the seek still happened
        shell.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setJump((j) => ({ sec, n: (j?.n ?? 0) + 1 }));
        poke();
      }),
    [seekTo, poke],
  );
  useEffect(() => {
    if (!jump) return;
    const t = window.setTimeout(() => setJump(null), 1400);
    return () => window.clearTimeout(t);
  }, [jump]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const toggleFullscreen = () => {
    const el = shell.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el?.requestFullscreen) void el.requestFullscreen();
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else v?.webkitEnterFullscreen?.(); // iPhone: only the video element itself can go fullscreen
  };

  // Scrubber: pointer position → time, with drag.
  const bar = useRef<HTMLDivElement>(null);
  const secAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { x: f * r.width, sec: f * (duration || 0) };
  };
  const onBarDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubbing(true);
    const { sec } = secAt(e.clientX);
    seekTo(sec);
  };
  const onBarMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const h = secAt(e.clientX);
    setHover(h);
    if (scrubbing) seekTo(h.sec);
  };
  const onBarUp = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubbing) e.currentTarget.releasePointerCapture(e.pointerId);
    setScrubbing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const v = video.current;
    if (!v) return;
    const key = e.key.toLowerCase();
    const handled = (() => {
      if (key === " " || key === "k") {
        // Space on a focused control button activates that button instead.
        if (key === " " && e.target instanceof HTMLButtonElement) return false;
        toggle();
      } else if (key === "arrowleft") seekTo(v.currentTime - 5);
      else if (key === "arrowright") seekTo(v.currentTime + 5);
      else if (key === "j") seekTo(v.currentTime - 10);
      else if (key === "l") seekTo(v.currentTime + 10);
      else if (key === "f") toggleFullscreen();
      else if (key === "c") setPrefs({ captions: !prefs.captions });
      else if (key === "m") setPrefs({ muted: !prefs.muted });
      else return false;
      return true;
    })();
    if (handled) {
      e.preventDefault();
      poke();
    }
  };

  const chapterAt = (sec: number) => [...chapters].reverse().find((c) => sec >= c.startSec);
  const preview = hover && frames.length ? frameAt(frames, hover.sec) : undefined;
  const showControls = visible || !playing || scrubbing || speedOpen;
  const pct = duration ? (second / duration) * 100 : 0;

  return (
    <div
      ref={shell}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={poke}
      onPointerLeave={() => playing && !scrubbing && setVisible(false)}
      aria-label="Lecture video. Space plays or pauses; arrow keys skip 5 seconds."
      className={`group/player relative overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        fullscreen ? "flex h-full w-full items-center" : "rounded-xl"
      } ${showControls ? "" : "cursor-none"}`}
    >
      <video
        ref={video}
        src={`/media/${lectureId}/video`}
        poster={posterFrameId ? frameUrl(lectureId, posterFrameId) : undefined}
        preload="metadata"
        playsInline
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
        }}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          const track = e.currentTarget.textTracks[0];
          if (track) track.mode = prefs.captions ? "showing" : "hidden";
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          playerBus.reportTime(t);
          setSecond(Math.floor(t));
          if (!playing) paint(t);
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
          setBuffered(v.duration ? end / v.duration : 0);
        }}
        className={`block w-full ${fullscreen ? "h-full object-contain" : "aspect-video"}`}
      >
        <track kind="captions" src={`/api/lectures/${lectureId}/captions.vtt`} srcLang="en" label="English" default />
      </video>

      {/* Big play button before the first play. */}
      {!started && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="anim-pop absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-window transition-transform hover:scale-105"
        >
          <PlayIcon className="ml-1 h-7 w-7" />
        </button>
      )}

      {/* Seek feedback. Only these overlays are keyed: keying the wrapper would reload the video. */}
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

      {/* Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Scrubber */}
        <div
          ref={bar}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={second}
          aria-valuetext={`${formatTime(second)} of ${formatTime(duration)}`}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerLeave={() => !scrubbing && setHover(null)}
          className="group/bar relative flex h-4 cursor-pointer touch-none items-center"
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 group-hover/bar:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${buffered * 100}%` }} />
            <div ref={fill} className="absolute inset-y-0 left-0 bg-white" style={{ width: `${pct}%` }} />
            {/* Chapter breaks: thin gaps where each chapter starts. */}
            {duration > 0 &&
              chapters.slice(1).map((c) => (
                <span key={c.id} aria-hidden className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-black/60" style={{ left: `${(c.startSec / duration) * 100}%` }} />
              ))}
          </div>
          <div
            ref={knob}
            aria-hidden
            className={`absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow transition-transform duration-150 ${scrubbing ? "scale-110" : "scale-0 group-hover/bar:scale-100"}`}
            style={{ left: `${pct}%` }}
          />

          {/* Hover preview: the board at that moment, its time and chapter. */}
          {hover && duration > 0 && (
            <div
              className="anim-fade pointer-events-none absolute bottom-6 -translate-x-1/2"
              style={{ left: Math.min(Math.max(hover.x, 88), (bar.current?.clientWidth ?? 0) - 88) }}
            >
              <div className="w-44 overflow-hidden rounded-lg border border-white/15 bg-black/85 shadow-window">
                {preview && <img src={frameUrl(lectureId, preview.id)} alt="" className="aspect-video w-full object-cover" />}
                <div className="px-2 py-1.5">
                  <p className="font-mono text-xs tabular-nums">{formatTime(hover.sec)}</p>
                  {chapterAt(hover.sec) && <p className="truncate text-[11px] text-white/70">{chapterAt(hover.sec)!.title}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-1 flex items-center gap-1 text-sm">
          <CtrlButton label={playing ? "Pause (k)" : "Play (k)"} onClick={toggle}>
            {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </CtrlButton>
          <CtrlButton label="Back 10 seconds (j)" onClick={() => seekTo((video.current?.currentTime ?? 0) - 10)}>
            <SkipIcon back className="h-5 w-5" />
          </CtrlButton>
          <CtrlButton label="Forward 10 seconds (l)" onClick={() => seekTo((video.current?.currentTime ?? 0) + 10)}>
            <SkipIcon className="h-5 w-5" />
          </CtrlButton>

          <div className="group/vol flex items-center">
            <CtrlButton label={prefs.muted || prefs.volume === 0 ? "Unmute (m)" : "Mute (m)"} onClick={() => setPrefs({ muted: !prefs.muted })}>
              <VolumeIcon muted={prefs.muted || prefs.volume === 0} className="h-5 w-5" />
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.muted ? 0 : prefs.volume}
              onChange={(e) => setPrefs({ volume: Number(e.target.value), muted: Number(e.target.value) === 0 })}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
            />
          </div>

          <span className="ml-2 font-mono text-xs text-white/85 tabular-nums">
            {formatTime(second)} <span className="text-white/45">/ {formatTime(duration)}</span>
          </span>
          {chapterAt(second) && <span className="ml-2 hidden truncate text-xs text-white/60 sm:inline">· {chapterAt(second)!.title}</span>}

          <span className="ml-auto flex items-center gap-1">
            <div className="relative">
              <CtrlButton label="Playback speed" onClick={() => setSpeedOpen((o) => !o)} wide>
                <span className="font-mono text-xs tabular-nums">{prefs.speed}×</span>
              </CtrlButton>
              {speedOpen && (
                <div role="menu" className="anim-pop absolute right-0 bottom-full mb-2 origin-bottom-right overflow-hidden rounded-lg border border-white/15 bg-black/90 py-1 shadow-window backdrop-blur-sm">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="menuitemradio"
                      aria-checked={prefs.speed === s}
                      onClick={() => {
                        setPrefs({ speed: s });
                        setSpeedOpen(false);
                      }}
                      className={`block w-full px-4 py-1 text-left font-mono text-xs tabular-nums transition-colors hover:bg-white/10 ${prefs.speed === s ? "text-white" : "text-white/60"}`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>
            <CtrlButton label={prefs.captions ? "Hide captions (c)" : "Show captions (c)"} onClick={() => setPrefs({ captions: !prefs.captions })} active={prefs.captions}>
              <span className="rounded-[3px] border border-current px-1 font-mono text-[10px] leading-tight font-semibold">CC</span>
            </CtrlButton>
            <CtrlButton label={fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"} onClick={toggleFullscreen}>
              <FullscreenIcon exit={fullscreen} className="h-5 w-5" />
            </CtrlButton>
          </span>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, children, active, wide = false }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-8 items-center justify-center rounded-md transition-colors hover:bg-white/15 active:scale-95 ${wide ? "min-w-10 px-1.5" : "w-8"} ${
        active === false ? "text-white/55" : "text-white"
      }`}
    >
      {children}
    </button>
  );
}

const PlayIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);
const PauseIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
);
const SkipIcon = ({ back = false, className = "" }: { back?: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden style={back ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M19 12a7 7 0 1 1-2.05-4.95" />
    <path d="M19 4.5v3.5h-3.5" />
    <text x="12" y="15.2" textAnchor="middle" fontSize="7" fontWeight="600" fill="currentColor" stroke="none" style={back ? { transform: "scaleX(-1)", transformOrigin: "12px 12px" } : undefined}>
      10
    </text>
  </svg>
);
const VolumeIcon = ({ muted, className = "" }: { muted: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor" />
    {muted ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
  </svg>
);
const FullscreenIcon = ({ exit, className = "" }: { exit: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {exit ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
);
