import { describe, expect, it } from "vitest";
import { selectFrames } from "./frameSelect.ts";

const W = 64;
const H = 36;
const N = W * H;

/** A busy slide; different seeds give clearly different slides. */
const slide = (seed: number) => Uint8Array.from({ length: N }, (_, p) => ((p * seed * 37) % 200) + 20);
/** A white board with the first `fraction` of pixels inked. */
const board = (fraction: number) => Uint8Array.from({ length: N }, (_, p) => (p < fraction * N ? 30 : 230));
/** Darken a 12-column band: a person standing in front of the screen. */
const withPerson = (frame: Uint8Array, x0: number) =>
  frame.map((v, p) => (p % W >= x0 && p % W < x0 + 12 ? 60 : v));
const repeat = (frame: Uint8Array, n: number) => Array.from({ length: n }, () => frame);

describe("selectFrames", () => {
  it("keeps one frame for a slide that never changes, despite the 60 s floor", () => {
    const kept = selectFrames(repeat(slide(3), 300));
    expect(kept).toHaveLength(1);
    expect(kept[0]!.kind).toBe("change");
  });

  it("keeps one frame per slide and no redundant pre-change frame", () => {
    const kept = selectFrames([...repeat(slide(3), 30), ...repeat(slide(7), 30)]);
    expect(kept.map((k) => k.kind)).toEqual(["change", "change"]);
    expect(kept[1]!.index).toBeGreaterThanOrEqual(30);
  });

  it("captures a board filling up gradually, including the full board just before it is erased", () => {
    const writing = Array.from({ length: 200 }, (_, t) => board((t / 200) * 0.5));
    const kept = selectFrames([...writing, ...repeat(board(0), 30)]);
    expect(kept.filter((k) => k.kind === "gradual").length).toBeGreaterThan(3);
    // The nearly complete board (last ~10 s of writing) must be kept.
    expect(kept.some((k) => k.index >= 190 && k.index < 200)).toBe(true);
    // And the erased board after it.
    expect(kept.at(-1)!.index).toBeGreaterThanOrEqual(200);
  });

  it("ignores someone walking past the board", () => {
    const frames = repeat(board(0.3), 120);
    for (let t = 50; t < 53; t++) frames[t] = withPerson(board(0.3), 10 + (t - 50) * 15);
    expect(selectFrames(frames)).toHaveLength(1);
  });

  it("returns the least occluded raw frame when keeping a moment", () => {
    const frames = [...repeat(slide(3), 20), ...repeat(slide(7), 20)];
    frames[33] = withPerson(slide(7), 20);
    const kept = selectFrames(frames);
    expect(kept.map((k) => k.index)).not.toContain(33);
  });

  it("falls back to floor frames through continuous motion", () => {
    let seed = 1;
    const noise = () =>
      Uint8Array.from({ length: N }, () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % 256));
    const kept = selectFrames(Array.from({ length: 150 }, noise));
    expect(kept.map((k) => k.kind)).toEqual(["floor", "floor"]);
  });

  it("respects the frame cap", () => {
    const frames = Array.from({ length: 200 }, (_, i) => repeat(slide(i + 2), 5)).flat();
    const kept = selectFrames(frames, { cap: 80 });
    expect(kept.length).toBeLessThanOrEqual(80);
    expect(kept.length).toBeGreaterThan(20);
  });
});
