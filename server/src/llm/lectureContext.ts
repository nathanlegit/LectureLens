import type { Frame, Segment, TimelineBlock } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { buildTimeline, renderTimeline } from "../pipeline/timeline.ts";

export interface LectureContext {
  title: string;
  durationSec: number;
  blocks: TimelineBlock[];
  byId: Map<string, TimelineBlock>;
  /** The rendered timeline: the cached prompt prefix for chapters, Ask and Quiz. */
  text: string;
}

export function loadLectureContext(db: DB, lectureId: string): LectureContext {
  const lecture = db.prepare("SELECT title, durationSec FROM lectures WHERE id = ?").get(lectureId) as
    | { title: string; durationSec: number }
    | undefined;
  if (!lecture) throw new Error(`Lecture ${lectureId} not found`);
  const frames = db
    .prepare("SELECT id, atSec, kind, description FROM frames WHERE lectureId = ? ORDER BY atSec")
    .all(lectureId) as Frame[];
  const segments = db
    .prepare("SELECT startSec, endSec, text FROM transcript_segments WHERE lectureId = ? ORDER BY startSec")
    .all(lectureId) as Segment[];
  const blocks = buildTimeline(frames, segments, lecture.durationSec);
  return {
    title: lecture.title,
    durationSec: lecture.durationSec,
    blocks,
    byId: new Map(blocks.map((b) => [b.id, b])),
    text: renderTimeline(blocks),
  };
}

/**
 * System prompt for every call that reasons over the timeline. The timeline comes first and
 * carries the cache breakpoint, so chapters, Ask and Quiz all share one cached prefix; the
 * route's own instructions follow it.
 */
export function timelineSystem(ctx: LectureContext, instructions: string) {
  return [
    {
      type: "text" as const,
      text: `Lecture: ${ctx.title}\n\nTimeline. Each block is one screen state: what was on screen (SCREEN) and what was said while it was up (SAID). Blocks are identified by IDs like F07.\n\n${ctx.text}`,
      cache_control: { type: "ephemeral" as const },
    },
    { type: "text" as const, text: instructions },
  ];
}
