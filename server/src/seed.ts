// Moves a processed lecture between machines: process on a Mac, export, import on the deployed
// server. The archive holds seed.json (the lecture's rows) plus video.mp4 and frames/.
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { DB } from "./db/db.ts";
import { run } from "./util/exec.ts";

const LECTURE_ID = /^[a-z0-9-]{1,36}$/;
const FRAME_ID = /^F\d{2,3}$/;

const SeedSchema = z.object({
  format: z.literal(1),
  module: z.object({ id: z.string().regex(LECTURE_ID), name: z.string(), glossary: z.string().nullable() }),
  lecture: z.object({ id: z.string().regex(LECTURE_ID), title: z.string(), durationSec: z.number() }),
  segments: z.array(z.object({ startSec: z.number(), endSec: z.number(), text: z.string() })),
  frames: z.array(
    z.object({ id: z.string().regex(FRAME_ID), atSec: z.number(), kind: z.string(), hash: z.string().nullable(), description: z.string().nullable() }),
  ),
  chapters: z.array(
    z.object({
      id: z.string(),
      idx: z.number().int(),
      title: z.string(),
      startBlockId: z.string(),
      startSec: z.number(),
      endSec: z.number(),
      summary: z.string(),
    }),
  ),
});
type Seed = z.infer<typeof SeedSchema>;

/** Writes an uncompressed .tar (the video is already compressed) and returns its path. */
export async function exportSeed(db: DB, dataDir: string, lectureId: string, outFile: string): Promise<string> {
  const lecture = db.prepare("SELECT id, moduleId, title, durationSec, status FROM lectures WHERE id = ?").get(lectureId) as
    | { id: string; moduleId: string; title: string; durationSec: number; status: string }
    | undefined;
  if (!lecture) throw new Error(`Lecture ${lectureId} not found`);
  if (lecture.status !== "ready") throw new Error(`Lecture ${lectureId} is not ready (status: ${lecture.status})`);

  const seed: Seed = {
    format: 1,
    module: db.prepare("SELECT id, name, glossary FROM modules WHERE id = ?").get(lecture.moduleId) as Seed["module"],
    lecture: { id: lecture.id, title: lecture.title, durationSec: lecture.durationSec },
    segments: db.prepare("SELECT startSec, endSec, text FROM transcript_segments WHERE lectureId = ? ORDER BY startSec").all(lectureId) as Seed["segments"],
    frames: db.prepare("SELECT id, atSec, kind, hash, description FROM frames WHERE lectureId = ? ORDER BY atSec").all(lectureId) as Seed["frames"],
    chapters: db
      .prepare("SELECT id, idx, title, startBlockId, startSec, endSec, summary FROM chapters WHERE lectureId = ? ORDER BY idx")
      .all(lectureId) as Seed["chapters"],
  };
  SeedSchema.parse(seed);

  const staging = mkdtempSync(join(tmpdir(), "lecture-lens-seed-"));
  try {
    writeFileSync(join(staging, "seed.json"), JSON.stringify(seed));
    // Only what the deployed app serves: no audio, samples or debugging pages.
    // Absolute path: a second -C is relative to the first. COPYFILE_DISABLE stops macOS tar adding
    // AppleDouble "._*" metadata files, which Linux tar would unpack as real files.
    await run("tar", ["-cf", outFile, "-C", staging, "seed.json", "-C", resolve(dataDir, lectureId), "video.mp4", "frames"], {
      COPYFILE_DISABLE: "1",
    });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return outFile;
}

/** Deletes macOS AppleDouble "._*" metadata files that archives made on a Mac can carry. */
function removeAppleDouble(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (name.startsWith("._") && (st.isFile() || st.isSymbolicLink())) rmSync(path);
    else if (st.isDirectory()) removeAppleDouble(path);
  }
}

/** Rejects anything but plain files and directories, with only the expected names. */
function checkExtracted(dir: string, frameIds: Set<string>) {
  const allowedTop = new Set(["seed.json", "video.mp4", "frames"]);
  for (const name of readdirSync(dir)) {
    if (!allowedTop.has(name)) throw new Error(`Unexpected file in archive: ${name}`);
  }
  for (const path of [join(dir, "seed.json"), join(dir, "video.mp4"), join(dir, "frames")]) {
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new Error(`Archive is missing or links ${path}`);
  }
  for (const name of readdirSync(join(dir, "frames"))) {
    const st = lstatSync(join(dir, "frames", name));
    if (!st.isFile() || !/^F\d{2,3}\.jpg$/.test(name)) throw new Error(`Unexpected file in archive: frames/${name}`);
  }
  for (const id of frameIds) {
    if (!existsSync(join(dir, "frames", `${id}.jpg`))) throw new Error(`Archive is missing frames/${id}.jpg`);
  }
}

/** Installs a seed archive, replacing any existing copy of the same lecture. Returns the lecture ID. */
export async function importSeed(db: DB, dataDir: string, archivePath: string): Promise<string> {
  const work = join(dataDir, `.import-${randomUUID().slice(0, 8)}`);
  try {
    mkdirSync(work, { recursive: true });
    await run("tar", ["-xf", archivePath, "-C", work, "--no-same-owner"]);
    removeAppleDouble(work);
    const seed = SeedSchema.parse(JSON.parse(readFileSync(join(work, "seed.json"), "utf8")));
    checkExtracted(work, new Set(seed.frames.map((f) => f.id)));

    const { id } = seed.lecture;
    const target = join(dataDir, id);
    rmSync(join(work, "seed.json"));
    rmSync(target, { recursive: true, force: true });
    renameSync(work, target);

    db.transaction(() => {
      db.prepare("INSERT INTO modules (id, name, glossary) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, glossary = excluded.glossary").run(
        seed.module.id,
        seed.module.name,
        seed.module.glossary,
      );
      // Cascades to segments, frames, chapters, messages and quiz questions of an older copy.
      db.prepare("DELETE FROM lectures WHERE id = ?").run(id);
      db.prepare(
        "INSERT INTO lectures (id, moduleId, title, videoPath, durationSec, status, isSeed) VALUES (?, ?, ?, ?, ?, 'ready', 1)",
      ).run(id, seed.module.id, seed.lecture.title, join(target, "video.mp4"), seed.lecture.durationSec);
      const seg = db.prepare("INSERT INTO transcript_segments (lectureId, startSec, endSec, text) VALUES (?, ?, ?, ?)");
      for (const s of seed.segments) seg.run(id, s.startSec, s.endSec, s.text);
      const frame = db.prepare("INSERT INTO frames (lectureId, id, atSec, kind, hash, imagePath, description) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const f of seed.frames) frame.run(id, f.id, f.atSec, f.kind, f.hash, join(target, "frames", `${f.id}.jpg`), f.description);
      const chapter = db.prepare(
        "INSERT INTO chapters (id, lectureId, idx, title, startBlockId, startSec, endSec, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const c of seed.chapters) chapter.run(c.id, id, c.idx, c.title, c.startBlockId, c.startSec, c.endSec, c.summary);
    })();
    return id;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
