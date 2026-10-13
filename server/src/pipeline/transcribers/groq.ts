import { readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Segment } from "@lecture-lens/shared";
import { config } from "../../config.ts";
import { run } from "../../util/exec.ts";
import type { Transcriber } from "./index.ts";

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
// Free-tier upload limit is 25 MB; leave headroom for the multipart envelope.
const MAX_BYTES = 24 * 1024 * 1024;

interface VerboseJson {
  segments?: { start: number; end: number; text: string; no_speech_prob?: number }[];
}

/**
 * Hosted Whisper for servers without a GPU. Speech-quality Opus (24 kbps mono) keeps a 90-minute
 * lecture near 17 MB, so the whole recording goes in one request: no chunk seams to stitch.
 */
export const groq: Transcriber = async (wavPath, { glossary, workDir }) => {
  if (!config.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
  const opus = join(workDir, "audio.ogg");
  try {
    await run("ffmpeg", ["-v", "error", "-y", "-i", wavPath, "-ac", "1", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", opus]);
    const size = statSync(opus).size;
    if (size > MAX_BYTES) throw new Error(`Compressed audio is ${(size / 1e6).toFixed(1)} MB, over Groq's upload limit`);

    const form = new FormData();
    form.append("file", new Blob([readFileSync(opus)], { type: "audio/ogg" }), "audio.ogg");
    form.append("model", MODEL);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("temperature", "0");
    if (glossary) form.append("prompt", glossary.slice(0, 800));

    let res: Response | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      // Rate limits and server errors are worth retrying; anything else is not.
      if (res.ok || (res.status !== 429 && res.status < 500)) break;
      const wait = Number(res.headers.get("retry-after")) || 5 * attempt;
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
    if (!res!.ok) throw new Error(`Groq transcription failed (${res!.status}): ${(await res!.text()).slice(0, 300)}`);

    const json = (await res!.json()) as VerboseJson;
    return (json.segments ?? [])
      .filter((s) => (s.no_speech_prob ?? 0) < 0.8)
      .map((s): Segment => ({ startSec: s.start, endSec: s.end, text: s.text.trim() }))
      .filter((s) => s.text.length > 0);
  } finally {
    rmSync(opus, { force: true });
  }
};
