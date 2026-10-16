import type { FrameKind } from "@lecture-lens/shared";

/**
 * Chooses which moments of a lecture to keep as frames, from small grayscale samples
 * (one per second, e.g. 64x36). Pure function: no I/O, so it can be tuned and tested offline.
 *
 * Decisions are made on a per-pixel temporal median of the last `window` samples rather than
 * the raw samples. A lecturer walking past the board disappears in the median, while writing
 * that stays on the board survives it. When a moment is kept, the raw sample in that window
 * closest to the median is returned: the least occluded view of that screen state.
 */

export interface SelectOptions {
  /** Median-to-median jump (mean abs diff, 0-255) that counts as a cut. */
  tCut: number;
  /** Accumulated change against the last kept frame that is worth a new frame (slow writing). */
  tGrad: number;
  /** Below this, two screens are the same (compression noise, tiny camera shake). */
  eps: number;
  /** Median window in samples; odd. */
  window: number;
  /** Seconds with nothing kept before a floor frame is considered. */
  floorSec: number;
  /** Maximum frames to return; thresholds are raised until the selection fits. */
  cap: number;
}

export const DEFAULT_SELECT_OPTIONS: SelectOptions = {
  tCut: 12,
  tGrad: 6,
  eps: 1.5,
  window: 7,
  floorSec: 60,
  cap: 80,
};

export interface KeptFrame {
  /** Index of the raw sample to extract; seconds when sampling at 1 fps. */
  index: number;
  kind: FrameKind;
}

export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

export function temporalMedian(samples: Uint8Array[], window: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  const buf: number[] = [];
  for (let t = 0; t < samples.length; t++) {
    const from = Math.max(0, t - window + 1);
    const len = samples[t]!.length;
    const med = new Uint8Array(len);
    for (let p = 0; p < len; p++) {
      buf.length = 0;
      for (let i = from; i <= t; i++) buf.push(samples[i]![p]!);
      buf.sort((x, y) => x - y);
      med[p] = buf[buf.length >> 1]!;
    }
    out.push(med);
  }
  return out;
}

export function selectFrames(samples: Uint8Array[], options: Partial<SelectOptions> = {}): KeptFrame[] {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options };
  if (samples.length === 0) return [];
  const bg = temporalMedian(samples, opts.window);

  let tCut = opts.tCut;
  let tGrad = opts.tGrad;
  let kept = selectOnce(samples, bg, { ...opts, tCut, tGrad });
  for (let i = 0; i < 40 && kept.length > opts.cap; i++) {
    tCut *= 1.1;
    tGrad *= 1.1;
    kept = selectOnce(samples, bg, { ...opts, tCut, tGrad });
  }
  if (kept.length === 0) {
    // A clip that never holds still and is shorter than the floor interval would otherwise get no
    // frame at all, leaving nothing to describe or chapter: keep its middle.
    return [{ index: Math.floor(samples.length / 2), kind: "floor" }];
  }
  return kept.length > opts.cap ? thinEvenly(kept, opts.cap) : kept;
}

function selectOnce(raw: Uint8Array[], bg: Uint8Array[], o: SelectOptions): KeptFrame[] {
  const kept: KeptFrame[] = [];
  let lastKeptBg: Uint8Array | null = null;
  let lastKeptT = -1;
  let lastStable = -1;
  // Set by a cut (and at the start): we wait for the screen to settle before deciding.
  // preRef is the last settled moment before the cut, or -1 at the start.
  let pending: { preRef: number } | null = { preRef: -1 };

  const keep = (t: number, kind: FrameKind) => {
    let best = t;
    let bestD = Infinity;
    for (let i = Math.max(0, t - o.window + 1); i <= t; i++) {
      const d = meanAbsDiff(raw[i]!, bg[t]!);
      if (d < bestD) [best, bestD] = [i, d];
    }
    if (!kept.some((k) => k.index === best)) kept.push({ index: best, kind });
    lastKeptBg = bg[t]!;
    lastKeptT = t;
  };
  const differsFromKept = (t: number, threshold: number) =>
    lastKeptBg === null || meanAbsDiff(bg[t]!, lastKeptBg) > threshold;
  const sinceKept = (t: number) => t - Math.max(lastKeptT, 0);

  for (let t = 0; t < bg.length; t++) {
    const stable =
      t >= 2 && meanAbsDiff(bg[t]!, bg[t - 1]!) < o.eps && meanAbsDiff(bg[t - 1]!, bg[t - 2]!) < o.eps;
    const cut = t >= 1 && meanAbsDiff(bg[t - 1]!, bg[t]!) > o.tCut;

    if (cut && !pending) pending = { preRef: lastStable };
    if (stable) lastStable = t;

    if (pending) {
      if (stable) {
        const { preRef } = pending;
        pending = null;
        const returned = preRef >= 0 && meanAbsDiff(bg[t]!, bg[preRef]!) < o.tGrad;
        if (!returned) {
          // A real change: keep the last full view of the old screen (the board before it was
          // erased), then the new screen.
          if (preRef > lastKeptT && differsFromKept(preRef, o.eps)) keep(preRef, "prechange");
          if (differsFromKept(t, o.eps)) keep(t, "change");
          continue;
        }
        // The screen came back to what it was: an occlusion, not a change. Fall through.
      } else {
        // Continuous motion (a demo video, a camera pan): fall back to the floor.
        if (sinceKept(t) >= o.floorSec) {
          keep(t, "floor");
          pending = null;
        }
        continue;
      }
    }

    if (stable && lastKeptBg && differsFromKept(t, o.tGrad)) {
      keep(t, "gradual");
    } else if (sinceKept(t) >= o.floorSec) {
      if (differsFromKept(t, o.eps)) keep(t, "floor");
      else lastKeptT = t; // same screen as last kept: restart the floor timer, pay for nothing
    }
  }
  return kept.sort((a, b) => a.index - b.index);
}

function thinEvenly(kept: KeptFrame[], cap: number): KeptFrame[] {
  const step = kept.length / cap;
  return Array.from({ length: cap }, (_, i) => kept[Math.floor(i * step)]!);
}
