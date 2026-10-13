import { readFileSync } from "node:fs";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import pLimit from "p-limit";
import { z } from "zod";
import { anthropic, logUsage, MODELS } from "../llm/client.ts";
import { formatTime } from "./timeline.ts";
import type { StageFn } from "./types.ts";

export const FrameDescSchema = z.object({
  kind: z.enum(["slide", "board", "code", "demo", "camera", "other"]),
  sameAsPrevious: z.boolean(),
  delta: z.string(),
  text: z.string(),
  latex: z.array(z.string()),
  code: z.string().nullable(),
  diagram: z.string().nullable(),
});
export type FrameDesc = z.infer<typeof FrameDescSchema>;

const SYSTEM = `You transcribe what is visible on screen in one frame of a university lecture recording, so that a student can later ask questions about it without seeing the video.

You get two images: the PREVIOUS kept frame (for context only) and the CURRENT frame (the one to describe), plus what the lecturer said around that moment.

Rules:
- Describe only the CURRENT frame, and only what is visibly written or shown. Use the transcript solely to read ambiguous handwriting or symbols; never add content that is not visible, and never describe something as drawn because the lecturer talks about it.
- Text cut off by the frame edge or hidden behind the lecturer: transcribe only the visible characters and mark the gap with "…" (e.g. "…ear Algebra"). Never complete or guess cropped words, names or titles.
- Small or distant writing (a wide shot of the whole board): transcribe only what you can actually read at this resolution. Write \\text{?} for any digit, sign or symbol you cannot make out, and leave out lines you cannot read at all. Never reconstruct a matrix or equation from what such examples usually look like, or copy it from the previous frame: a wrong number stated confidently is worse than a gap.
- Equations go in "latex", one entry per line or equation, exactly as written (including partly erased or half-finished lines; mark unreadable parts with \\text{?}).
- Slide or board prose, headings and labels go in "text", verbatim where legible.
- Code goes in "code", verbatim.
- Diagrams and graphs go in "diagram": what kind of figure, axes and labels, what is drawn and how parts relate.
- Ignore the lecturer's body and the room. If nothing instructional is visible, use kind "camera" with empty fields.
- "delta": one sentence on what is new or changed in the written or shown content compared with the PREVIOUS frame ("" if no previous frame). Ignore camera movement, zoom, framing and where the lecturer is standing; if only those changed, set "sameAsPrevious" and leave "delta" empty.`;

export function renderDescription(d: FrameDesc): string {
  const parts = [`(${d.kind})`];
  if (d.text) parts.push(d.text);
  for (const eq of d.latex) parts.push(`$${eq}$`);
  if (d.code) parts.push(`code:\n${d.code}`);
  if (d.diagram) parts.push(`diagram: ${d.diagram}`);
  if (d.delta && !d.sameAsPrevious) parts.push(`new since previous frame: ${d.delta}`);
  return parts.join("\n");
}

const UNREADABLE = "(unreadable)";

interface FrameRow {
  id: string;
  atSec: number;
  imagePath: string;
  description: string | null;
}

const image = (path: string) => ({
  type: "image" as const,
  source: { type: "base64" as const, media_type: "image/jpeg" as const, data: readFileSync(path).toString("base64") },
});

/** Describes every frame still missing a description; reruns pick up where the last run stopped. */
export const describe: StageFn = async ({ lecture, db, progress, log }) => {
  const frames = db
    .prepare("SELECT id, atSec, imagePath, description FROM frames WHERE lectureId = ? ORDER BY atSec")
    .all(lecture.id) as FrameRow[];
  const transcriptNear = db.prepare(
    "SELECT startSec, text FROM transcript_segments WHERE lectureId = ? AND endSec >= ? AND startSec <= ? ORDER BY startSec",
  );
  const save = db.prepare("UPDATE frames SET description = ? WHERE lectureId = ? AND id = ?");

  let done = frames.filter((f) => f.description !== null).length;
  progress(done, frames.length);
  const limit = pLimit(8);

  await Promise.all(
    frames.map((frame, i) => {
      if (frame.description !== null) return;
      return limit(async () => {
        const previous = frames[i - 1];
        const said = (transcriptNear.all(lecture.id, frame.atSec - 30, frame.atSec + 30) as { startSec: number; text: string }[])
          .map((s) => `[${formatTime(s.startSec)}] ${s.text}`)
          .join("\n");

        const content = [
          ...(previous ? [{ type: "text" as const, text: "PREVIOUS frame:" }, image(previous.imagePath)] : []),
          { type: "text" as const, text: `CURRENT frame, at ${formatTime(frame.atSec)}:` },
          image(frame.imagePath),
          { type: "text" as const, text: `Said around this moment:\n${said || "(nothing)"}` },
        ];

        const response = await anthropic.messages.parse({
          model: MODELS.frames,
          max_tokens: 4000,
          system: SYSTEM,
          messages: [{ role: "user", content }],
          output_config: { effort: "low", format: zodOutputFormat(FrameDescSchema) },
        });
        logUsage(db, "describe", MODELS.frames, response.usage);

        let description: string;
        if (response.stop_reason === "refusal" || !response.parsed_output) {
          log(`${frame.id}: no description (${response.stop_reason})`);
          description = UNREADABLE;
        } else {
          description = renderDescription(response.parsed_output);
        }
        save.run(description, lecture.id, frame.id);
        progress(++done, frames.length);
      });
    }),
  );
};
