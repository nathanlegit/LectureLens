import type { Segment } from "@lecture-lens/shared";
import { config } from "../../config.ts";
import { whisperCpp } from "./whispercpp.ts";

export type Transcriber = (wavPath: string, opts: { glossary: string | null; workDir: string }) => Promise<Segment[]>;

export function getTranscriber(): Transcriber {
  if (config.TRANSCRIBER === "groq") {
    // Hosted transcriber for the deployed server arrives in Milestone 5.
    throw new Error("TRANSCRIBER=groq is not implemented yet");
  }
  return whisperCpp;
}
