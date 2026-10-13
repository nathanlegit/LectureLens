import type { Segment } from "@lecture-lens/shared";
import { config } from "../../config.ts";
import { groq } from "./groq.ts";
import { whisperCpp } from "./whispercpp.ts";

export type Transcriber = (wavPath: string, opts: { glossary: string | null; workDir: string }) => Promise<Segment[]>;

export function getTranscriber(): Transcriber {
  return config.TRANSCRIBER === "groq" ? groq : whisperCpp;
}
