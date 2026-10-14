import type { Segment } from "@lecture-lens/shared";

const stamp = (sec: number) => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
};

/** WebVTT captions from transcript segments, for the video's native caption track. */
export function toVtt(segments: Segment[]): string {
  const cues = segments
    .filter((s) => s.text.trim() && s.endSec > s.startSec)
    // "-->" inside cue text would end the cue early; a blank line would end it outright.
    .map((s) => `${stamp(s.startSec)} --> ${stamp(s.endSec)}\n${s.text.trim().replace(/-->/g, "→").replace(/\n\s*\n/g, "\n")}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
