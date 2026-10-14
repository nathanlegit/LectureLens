import { describe, expect, it } from "vitest";
import { activeSegment } from "./Transcript.tsx";

const segs = [0, 4, 9, 15].map((startSec, i, all) => ({ startSec, endSec: all[i + 1] ?? 20, text: `s${i}` }));

describe("activeSegment", () => {
  it("returns the last segment that has started", () => {
    expect(activeSegment(segs, 0)).toBe(0);
    expect(activeSegment(segs, 3.9)).toBe(0);
    expect(activeSegment(segs, 4)).toBe(1);
    expect(activeSegment(segs, 14.99)).toBe(2);
    expect(activeSegment(segs, 100)).toBe(3);
  });

  it("is -1 before the first line and for an empty transcript", () => {
    expect(activeSegment([{ startSec: 2, endSec: 3, text: "x" }], 1)).toBe(-1);
    expect(activeSegment([], 5)).toBe(-1);
  });
});
