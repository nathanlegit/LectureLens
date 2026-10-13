import { randomUUID } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, logUsage, MODELS } from "../llm/client.ts";
import { loadLectureContext, timelineSystem, type LectureContext } from "../llm/lectureContext.ts";
import type { StageFn } from "./types.ts";

const ChaptersSchema = z.object({
  chapters: z.array(z.object({ title: z.string(), startBlockId: z.string(), summary: z.string() })),
});
type ChaptersOutput = z.infer<typeof ChaptersSchema>;

const INSTRUCTIONS = `Split this lecture into 5 to 12 chapters, in order, so a student can see in two minutes what it covered.
- Each chapter starts at a block: give that block's ID as startBlockId. The first chapter starts at the first block.
- Title: a few words naming the topic, as the lecturer would ("Row picture of 2x2 systems"), not "Introduction" or "Part 2".
- Summary: 1 to 2 sentences on what is taught, including the key equation or result if there is one (LaTeX in $...$).`;

/** Returns a list of problems, empty when the chapters are usable. */
export function checkChapters(out: ChaptersOutput, ctx: LectureContext): string[] {
  const problems: string[] = [];
  const order = ctx.blocks.map((b) => b.id);
  const n = out.chapters.length;
  if (n < 5 || n > 12) problems.push(`expected 5 to 12 chapters, got ${n}`);
  const idx = out.chapters.map((c) => order.indexOf(c.startBlockId));
  out.chapters.forEach((c, i) => {
    if (idx[i] === -1) problems.push(`chapter "${c.title}" starts at unknown block ${c.startBlockId}`);
  });
  if (idx[0] !== 0) problems.push(`the first chapter must start at ${order[0]}`);
  for (let i = 1; i < idx.length; i++) {
    if (idx[i]! !== -1 && idx[i]! <= idx[i - 1]!) problems.push(`chapters out of order at "${out.chapters[i]!.title}"`);
  }
  return problems;
}

export const chapter: StageFn = async ({ lecture, db, progress, log }) => {
  const ctx = loadLectureContext(db, lecture.id);
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: "Make the chapters." }];
  progress(0, 1);

  let out: ChaptersOutput | null = null;
  for (let attempt = 1; attempt <= 2 && !out; attempt++) {
    const response = await anthropic.beta.messages.parse({
      model: MODELS.reasoning,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: timelineSystem(ctx, INSTRUCTIONS),
      messages,
      output_config: { effort: "medium", format: zodOutputFormat(ChaptersSchema) },
    });
    logUsage(db, "chapter", MODELS.reasoning, response.usage);
    if (response.stop_reason === "refusal") throw new Error("The model declined to chapter this lecture");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`No chapters returned (${response.stop_reason})`);

    const problems = checkChapters(parsed, ctx);
    if (problems.length === 0) {
      out = parsed;
    } else {
      log(`attempt ${attempt}: ${problems.join("; ")}`);
      // Retry once with the problems spelled out.
      messages.push(
        { role: "assistant", content: JSON.stringify(parsed) },
        { role: "user", content: `Fix these problems and return all chapters again: ${problems.join("; ")}` },
      );
    }
  }
  if (!out) throw new Error("Chapters failed validation twice");

  const insert = db.prepare(
    "INSERT INTO chapters (id, lectureId, idx, title, startBlockId, startSec, endSec, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare("DELETE FROM chapters WHERE lectureId = ?").run(lecture.id);
    out.chapters.forEach((c, i) => {
      const startSec = ctx.byId.get(c.startBlockId)!.startSec;
      const next = out.chapters[i + 1];
      const endSec = next ? ctx.byId.get(next.startBlockId)!.startSec : ctx.durationSec;
      insert.run(randomUUID(), lecture.id, i, c.title, c.startBlockId, startSec, endSec, c.summary);
    });
  })();
  log(`${out.chapters.length} chapters`);
  progress(1, 1);
};
