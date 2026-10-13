import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Segment } from "@lecture-lens/shared";
import { config } from "../../config.ts";
import { run } from "../../util/exec.ts";
import type { Transcriber } from "./index.ts";

interface WhisperJson {
  transcription: { offsets: { from: number; to: number }; text: string }[];
}

/** Local whisper.cpp (Metal on Apple Silicon). Voice-activity detection stops it inventing text over silence. */
export const whisperCpp: Transcriber = async (wavPath, { glossary, workDir }) => {
  const outBase = join(workDir, "whisper");
  const args = ["-m", config.WHISPER_MODEL_PATH, "-f", wavPath, "-oj", "-of", outBase, "-np"];
  if (config.WHISPER_VAD_MODEL_PATH) args.push("--vad", "-vm", config.WHISPER_VAD_MODEL_PATH);
  if (glossary) args.push("--prompt", glossary);
  await run(config.WHISPER_CLI, args);

  const json = JSON.parse(readFileSync(`${outBase}.json`, "utf8")) as WhisperJson;
  return json.transcription
    .map((s): Segment => ({ startSec: s.offsets.from / 1000, endSec: s.offsets.to / 1000, text: s.text.trim() }))
    .filter((s) => s.text.length > 0);
};
