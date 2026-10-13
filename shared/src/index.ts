// Types and schemas shared by server and web. Timestamps are float seconds everywhere.

export const STAGES = ["ingest", "transcribe", "frames", "describe", "chapter"] as const;
export type Stage = (typeof STAGES)[number];
export type LectureStatus = "queued" | Stage | "ready" | "failed";

export type FrameKind = "change" | "prechange" | "gradual" | "floor";

export interface Module {
  id: string;
  name: string;
  glossary: string | null;
  createdAt: string;
}

export interface Lecture {
  id: string;
  moduleId: string;
  title: string;
  durationSec: number | null;
  status: LectureStatus;
  failedStage: Stage | null;
  error: string | null;
  stageDone: number;
  stageTotal: number;
  isSeed: boolean;
  createdAt: string;
  /** Week of term the lecture belongs to; null until set. */
  week: number | null;
  /** A short overview of the whole lecture, written with the chapters. */
  summary: string | null;
  /** A frame about 15% in (past any title card), for thumbnails; null until frames exist. */
  thumbFrameId: string | null;
}

export interface Segment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface Frame {
  id: string; // "F07": also the timeline block ID the model cites
  atSec: number;
  kind: FrameKind;
  description: string | null;
}

export interface TimelineBlock {
  id: string;
  startSec: number;
  endSec: number;
  screen: string;
  said: string;
}

export interface Chapter {
  id: string;
  idx: number;
  title: string;
  startBlockId: string;
  startSec: number;
  endSec: number;
  summary: string;
}

export interface Citation {
  id: string;
  sec: number;
  thumbUrl: string;
}

/** "tell": a direct cited answer. "guide": the hint ladder; the answer only when asked for. */
export type AskMode = "tell" | "guide";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  mode: AskMode;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answerIdx: number;
  explanation: string;
  /** One note per option: the misconception behind picking it (null for the right answer). */
  misconceptions: (string | null)[];
  blockId: string;
  atSec: number;
}

export interface LectureDetail {
  lecture: Lecture;
  chapters: Chapter[];
  frames: Pick<Frame, "id" | "atSec" | "kind">[];
}

export interface ModuleWithLectures extends Module {
  lectures: Lecture[];
}

/** Events on the Ask SSE stream. */
export type AskEvent =
  | { type: "text"; text: string }
  | { type: "cite"; citation: Citation }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };
