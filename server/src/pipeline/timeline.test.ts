import { describe, expect, it } from "vitest";
import type { Frame, Segment } from "@lecture-lens/shared";
import { buildTimeline, formatTime, renderTimeline } from "./timeline.ts";

const frame = (id: string, atSec: number, description: string | null = `screen ${id}`): Frame => ({
  id,
  atSec,
  kind: "change",
  description,
});
const seg = (startSec: number, endSec: number, text: string): Segment => ({ startSec, endSec, text });

describe("buildTimeline", () => {
  it("assigns each segment to the frame on screen at its midpoint", () => {
    const blocks = buildTimeline(
      [frame("F02", 60), frame("F01", 2)],
      [seg(0, 4, "hello"), seg(57, 67, "straddles, mostly after"), seg(50, 58, "before the change"), seg(90, 95, "end")],
      120,
    );
    expect(blocks.map((b) => [b.id, b.startSec, b.endSec])).toEqual([
      ["F01", 0, 60],
      ["F02", 60, 120],
    ]);
    expect(blocks[0]!.said).toBe("hello before the change");
    expect(blocks[1]!.said).toBe("straddles, mostly after end");
  });

  it("marks frames not yet described", () => {
    const [block] = buildTimeline([frame("F01", 0, null)], [], 10);
    expect(block!.screen).toBe("(not described)");
  });

  it("renders a stable, citable format", () => {
    const text = renderTimeline(buildTimeline([frame("F01", 0), frame("F02", 750)], [seg(1, 3, "hi")], 3725));
    expect(text).toBe(
      "[F01 · 0:00–12:30]\nSCREEN: screen F01\nSAID: hi\n\n[F02 · 12:30–1:02:05]\nSCREEN: screen F02\nSAID: (nothing)",
    );
  });
});

describe("formatTime", () => {
  it("formats minutes and hours", () => {
    expect(formatTime(59.9)).toBe("0:59");
    expect(formatTime(3725)).toBe("1:02:05");
  });
});
