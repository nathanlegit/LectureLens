import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../util/exec.ts";
import { selectFrames, type SelectOptions } from "./frameSelect.ts";
import type { StageFn } from "./types.ts";

export const SAMPLE_W = 64;
export const SAMPLE_H = 36;
const SAMPLE_BYTES = SAMPLE_W * SAMPLE_H;

/** One 64x36 grayscale sample per second, cached in samples.bin so tuning never re-decodes the video. */
export async function loadSamples(dir: string): Promise<Uint8Array[]> {
  const cache = join(dir, "samples.bin");
  if (!existsSync(cache)) {
    const { stdout } = await run("ffmpeg", [
      "-v", "error", "-i", join(dir, "video.mp4"), "-map", "0:v:0",
      "-vf", `fps=1,scale=${SAMPLE_W}:${SAMPLE_H},format=gray`, "-f", "rawvideo", "pipe:",
    ]);
    writeFileSync(cache, stdout);
  }
  const buf = readFileSync(cache);
  const samples: Uint8Array[] = [];
  for (let off = 0; off + SAMPLE_BYTES <= buf.length; off += SAMPLE_BYTES) {
    samples.push(new Uint8Array(buf.buffer, buf.byteOffset + off, SAMPLE_BYTES));
  }
  return samples;
}

/** 64-bit difference hash of a sample, as hex: a cheap duplicate check between kept frames. */
export function dHash(sample: Uint8Array): string {
  const cell = (cx: number, cy: number) => {
    const x0 = Math.floor((cx * SAMPLE_W) / 9);
    const x1 = Math.floor(((cx + 1) * SAMPLE_W) / 9);
    const y0 = Math.floor((cy * SAMPLE_H) / 8);
    const y1 = Math.floor(((cy + 1) * SAMPLE_H) / 8);
    let sum = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += sample[y * SAMPLE_W + x]!;
    return sum / ((x1 - x0) * (y1 - y0));
  };
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (cell(x, y) > cell(x + 1, y) ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}

export const frameId = (i: number) => `F${String(i + 1).padStart(2, "0")}`;

/** Extracts one JPEG at `sec`, scaled to fit 1280x720. */
export function extractFrame(videoPath: string, sec: number, outPath: string, maxWidth = 1280) {
  return run("ffmpeg", [
    "-v", "error", "-y", "-ss", String(sec), "-i", videoPath, "-map", "0:v:0", "-frames:v", "1",
    "-vf", `scale='min(${maxWidth},iw)':-2`, "-q:v", "3", outPath,
  ]);
}

export function makeFramesStage(options: Partial<SelectOptions> = {}): StageFn {
  return async ({ lecture, db, dir, progress, log }) => {
    const samples = await loadSamples(dir);
    const kept = selectFrames(samples, options);
    const counts = Object.groupBy(kept, (k) => k.kind);
    log(`${samples.length} s sampled, keeping ${kept.length} frames: ${Object.entries(counts).map(([k, v]) => `${k} ${v!.length}`).join(", ")}`);

    const framesDir = join(dir, "frames");
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    db.prepare("DELETE FROM frames WHERE lectureId = ?").run(lecture.id);

    const insert = db.prepare(
      "INSERT INTO frames (lectureId, id, atSec, kind, hash, imagePath) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const [i, k] of kept.entries()) {
      const id = frameId(i);
      const imagePath = join(framesDir, `${id}.jpg`);
      await extractFrame(join(dir, "video.mp4"), k.index, imagePath);
      insert.run(lecture.id, id, k.index, k.kind, dHash(samples[k.index]!), imagePath);
      progress(i + 1, kept.length);
    }
  };
}

export const frames = makeFramesStage();
