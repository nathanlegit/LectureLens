import { existsSync, rmSync } from "node:fs";
import { config } from "../config.ts";
import { join } from "node:path";
import { ffprobe, run } from "../util/exec.ts";
import { UPLOAD_FILE, type StageFn } from "./types.ts";

export const MAX_DURATION_SEC = 95 * 60;

/** 16 kHz mono WAV for transcription. Deleted once transcription succeeds; re-extracted if it is rerun. */
export function extractAudio(videoPath: string, audioPath: string) {
  return run("ffmpeg", ["-v", "error", "-y", "-i", videoPath, "-map", "0:a:0", "-ac", "1", "-ar", "16000", audioPath]);
}

/** Validates the upload, normalises it to a seekable H.264/AAC MP4, and extracts 16 kHz mono audio. */
export const ingest: StageFn = async ({ lecture, db, dir, progress, log }) => {
  const source = join(dir, UPLOAD_FILE);
  const video = join(dir, "video.mp4");
  const audio = join(dir, "audio.wav");

  if (!existsSync(source)) {
    // A rerun after a successful ingest: the upload was already replaced by video.mp4.
    if (existsSync(video)) return;
    throw new Error("No uploaded file found");
  }

  const probe = await ffprobe(source);
  if (!probe.video) throw new Error("The file has no video stream");
  if (!probe.audio) throw new Error("The file has no audio stream");
  if (probe.durationSec > MAX_DURATION_SEC) throw new Error(`Recording is longer than ${MAX_DURATION_SEC / 60} minutes`);
  if (probe.sizeBytes > config.MAX_UPLOAD_MB * 1024 ** 2) throw new Error(`File is larger than ${config.MAX_UPLOAD_MB} MB`);
  progress(0, 2);

  // Map only the first real video and audio streams: uploads can carry cover art and subtitle tracks.
  const compatible = probe.video.codec === "h264" && probe.audio.codec === "aac";
  log(compatible ? "Remuxing (already H.264/AAC)" : `Re-encoding from ${probe.video.codec}/${probe.audio.codec}`);
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a:0",
    ...(compatible ? ["-c", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k"]),
    "-movflags", "+faststart", video,
  ]);
  progress(1, 2);

  await extractAudio(video, audio);
  progress(2, 2);

  db.prepare("UPDATE lectures SET videoPath = ?, durationSec = ? WHERE id = ?").run(video, probe.durationSec, lecture.id);
  rmSync(source);
};
