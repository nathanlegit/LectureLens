import { join } from "node:path";
import { STAGES, type Stage } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { chapter } from "../pipeline/chapter.ts";
import { describe } from "../pipeline/describe.ts";
import { frames } from "../pipeline/frames.ts";
import { ingest } from "../pipeline/ingest.ts";
import { transcribe } from "../pipeline/transcribe.ts";
import type { LectureRow, StageFn } from "../pipeline/types.ts";

const STAGE_FNS: Partial<Record<Stage, StageFn>> = { ingest, transcribe, frames, describe, chapter };

export interface RunOptions {
  dataDir: string;
  log?: (message: string) => void;
}

/**
 * Runs a lecture from its current status to the end. Each stage's outputs are on disk and in
 * the DB, so a failed or interrupted lecture resumes at the stage it was in.
 */
export async function runStages(db: DB, lectureId: string, { dataDir, log = () => {} }: RunOptions) {
  const get = db.prepare("SELECT * FROM lectures WHERE id = ?");
  const setStatus = db.prepare("UPDATE lectures SET status = ?, stageDone = 0, stageTotal = 0 WHERE id = ?");
  const setProgress = db.prepare("UPDATE lectures SET stageDone = ?, stageTotal = ? WHERE id = ?");

  let lecture = get.get(lectureId) as LectureRow;
  if (lecture.status === "queued") setStatus.run(STAGES[0], lectureId);

  for (let i = STAGES.indexOf((get.get(lectureId) as LectureRow).status as Stage); i >= 0 && i < STAGES.length; i++) {
    const stage = STAGES[i]!;
    const fn = STAGE_FNS[stage];
    if (!fn) {
      log(`stage "${stage}" is not implemented yet; stopping here`);
      return;
    }
    lecture = get.get(lectureId) as LectureRow;
    const started = Date.now();
    log(`→ ${stage}`);
    try {
      await fn({
        lecture,
        db,
        dir: join(dataDir, lectureId),
        progress: (done, total) => setProgress.run(done, total, lectureId),
        log: (m) => log(`  ${stage}: ${m}`),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE lectures SET status = 'failed', failedStage = ?, error = ? WHERE id = ?").run(stage, message, lectureId);
      log(`✗ ${stage} failed: ${message}`);
      throw err;
    }
    log(`✓ ${stage} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    setStatus.run(STAGES[i + 1] ?? "ready", lectureId);
  }
}
