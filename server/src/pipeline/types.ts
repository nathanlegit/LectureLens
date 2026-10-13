import type { LectureStatus, Stage } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";

export interface LectureRow {
  id: string;
  moduleId: string;
  title: string;
  videoPath: string | null;
  durationSec: number | null;
  status: LectureStatus;
  failedStage: Stage | null;
  error: string | null;
}

export interface StageContext {
  lecture: LectureRow;
  db: DB;
  /** DATA_DIR/<lectureId> */
  dir: string;
  progress(done: number, total: number): void;
  log(message: string): void;
}

export type StageFn = (ctx: StageContext) => Promise<void>;

/** Where an uploaded or CLI-provided file is placed before ingest. */
export const UPLOAD_FILE = "upload.bin";
