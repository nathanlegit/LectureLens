import { existsSync, rmSync, writeFileSync } from "node:fs";
import { extractAudio } from "./ingest.ts";
import { join } from "node:path";
import { getTranscriber } from "./transcribers/index.ts";
import type { StageFn } from "./types.ts";

export const transcribe: StageFn = async ({ lecture, db, dir, progress, log }) => {
  const { glossary } = db.prepare("SELECT glossary FROM modules WHERE id = ?").get(lecture.moduleId) as {
    glossary: string | null;
  };
  progress(0, 1);
  const audio = join(dir, "audio.wav");
  if (!existsSync(audio)) await extractAudio(join(dir, "video.mp4"), audio);
  const segments = await getTranscriber()(audio, { glossary, workDir: dir });
  log(`${segments.length} segments`);
  writeFileSync(join(dir, "transcript.json"), JSON.stringify(segments));

  const insert = db.prepare("INSERT INTO transcript_segments (lectureId, startSec, endSec, text) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    db.prepare("DELETE FROM transcript_segments WHERE lectureId = ?").run(lecture.id);
    for (const s of segments) insert.run(lecture.id, s.startSec, s.endSec, s.text);
  })();
  // The audio is only needed to transcribe; dropping it keeps a small volume from filling up.
  rmSync(audio, { force: true });
  rmSync(join(dir, "whisper.json"), { force: true });
  progress(1, 1);
};
