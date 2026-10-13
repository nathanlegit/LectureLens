import type { Frame, Segment, TimelineBlock } from "@lecture-lens/shared";

/**
 * Merges frames and transcript into one block per frame: block F07 covers the time from frame
 * F07 until the next frame, holding what was on screen and what was said meanwhile. Built on
 * demand, never stored. Must stay deterministic: its rendering is the cached prompt prefix.
 */
export function buildTimeline(frames: Frame[], segments: Segment[], durationSec: number): TimelineBlock[] {
  const sorted = [...frames].sort((a, b) => a.atSec - b.atSec);
  const blocks: TimelineBlock[] = sorted.map((f, i) => ({
    id: f.id,
    startSec: i === 0 ? 0 : f.atSec,
    endSec: sorted[i + 1]?.atSec ?? durationSec,
    screen: f.description ?? "(not described)",
    said: "",
  }));
  if (blocks.length === 0) return [];

  const said: string[][] = blocks.map(() => []);
  let b = 0;
  for (const seg of [...segments].sort((x, y) => x.startSec - y.startSec)) {
    const mid = (seg.startSec + seg.endSec) / 2;
    while (b < blocks.length - 1 && mid >= blocks[b]!.endSec) b++;
    said[b]!.push(seg.text.trim());
  }
  blocks.forEach((block, i) => (block.said = said[i]!.filter(Boolean).join(" ")));
  return blocks;
}

export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

export function renderTimeline(blocks: TimelineBlock[]): string {
  return blocks
    .map(
      (b) =>
        `[${b.id} · ${formatTime(b.startSec)}–${formatTime(b.endSec)}]\n` +
        `SCREEN: ${b.screen}\n` +
        `SAID: ${b.said || "(nothing)"}`,
    )
    .join("\n\n");
}
