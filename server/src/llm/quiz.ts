import { createHash, randomUUID } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { QuizQuestion } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { formatTime } from "../pipeline/timeline.ts";
import { anthropic, logUsage, MODELS } from "./client.ts";
import { loadLectureContext, timelineSystem } from "./lectureContext.ts";

const QuizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.object({ text: z.string(), correct: z.boolean(), misconception: z.string().nullable() })),
      explanation: z.string(),
      blockId: z.string(),
    }),
  ),
});
type QuizOutput = z.infer<typeof QuizSchema>;

const INSTRUCTIONS = `You write retrieval-practice quizzes on one chapter of this lecture, to check understanding rather than recall of wording.
- 3 to 5 questions, each with exactly 4 options and exactly one correct option.
- Ask about ideas, steps and results the student should be able to reproduce (what an equation means, what happens if something changes, which picture shows what), not trivia about what the lecturer said.
- Every wrong option must be a real misconception a student could hold about this material (e.g. confusing the row picture with the column picture), not a random distractor. Give each wrong option a one-sentence "misconception" note that names the mix-up, written to the student ("You may be mixing up..."). The correct option has misconception null.
- "explanation": 1 to 2 sentences on why the correct answer is right.
- "blockId": the block where the lecture shows the answer, from the chapter's blocks only.
- Use LaTeX in $...$ for maths in questions, options and notes.`;

/** Returns a list of problems, empty when the quiz is usable. */
export function checkQuiz(out: QuizOutput, chapterBlocks: Set<string>): string[] {
  const problems: string[] = [];
  if (out.questions.length < 3 || out.questions.length > 5) problems.push(`expected 3 to 5 questions, got ${out.questions.length}`);
  out.questions.forEach((q, i) => {
    const n = i + 1;
    if (q.options.length !== 4) problems.push(`question ${n} has ${q.options.length} options, not 4`);
    const correct = q.options.filter((o) => o.correct).length;
    if (correct !== 1) problems.push(`question ${n} has ${correct} correct options, not 1`);
    if (q.options.some((o) => !o.correct && !o.misconception?.trim())) problems.push(`question ${n} has a wrong option without a misconception note`);
    if (!chapterBlocks.has(q.blockId)) problems.push(`question ${n} cites ${q.blockId}, which is not in this chapter`);
  });
  return problems;
}

/** Deterministic shuffle (seeded per question) so stored order is stable and position carries no hint. */
export function shuffleOptions<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = createHash("sha256").update(seed).digest();
  for (let i = out.length - 1; i > 0; i--) {
    h = createHash("sha256").update(h).digest();
    const j = h.readUInt32BE(0) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface ChapterRow {
  id: string;
  lectureId: string;
  title: string;
  startSec: number;
  endSec: number;
}

type QuizRow = Omit<QuizQuestion, "options" | "misconceptions"> & { options: string; misconceptions: string };

export function getQuiz(db: DB, chapterId: string): QuizQuestion[] {
  const rows = db
    .prepare("SELECT id, question, options, answerIdx, explanation, misconceptions, blockId, atSec FROM quiz_questions WHERE chapterId = ? ORDER BY rowid")
    .all(chapterId) as QuizRow[];
  return rows.map((r) => ({ ...r, options: JSON.parse(r.options), misconceptions: JSON.parse(r.misconceptions) }));
}

/** Generates and stores a chapter's quiz, replacing any existing one. */
export async function generateQuiz(db: DB, chapterId: string): Promise<QuizQuestion[]> {
  const chapter = db.prepare("SELECT id, lectureId, title, startSec, endSec FROM chapters WHERE id = ?").get(chapterId) as ChapterRow | undefined;
  if (!chapter) throw new Error("Chapter not found");
  const ctx = loadLectureContext(db, chapter.lectureId);
  const blocks = ctx.blocks.filter((b) => b.startSec >= chapter.startSec && b.startSec < chapter.endSec);
  const chapterBlocks = new Set(blocks.map((b) => b.id));

  const messages: { role: "user" | "assistant"; content: string }[] = [
    {
      role: "user",
      content: `Write the quiz for the chapter "${chapter.title}" (${formatTime(chapter.startSec)}–${formatTime(chapter.endSec)}). Its blocks are: ${[...chapterBlocks].join(", ")}.`,
    },
  ];

  let out: QuizOutput | null = null;
  for (let attempt = 1; attempt <= 2 && !out; attempt++) {
    const response = await anthropic.beta.messages.parse({
      model: MODELS.reasoning,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: timelineSystem(ctx, INSTRUCTIONS),
      messages,
      output_config: { effort: "medium", format: zodOutputFormat(QuizSchema) },
    });
    logUsage(db, "quiz", MODELS.reasoning, response.usage);
    if (response.stop_reason === "refusal") throw new Error("The model declined to write this quiz");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`No quiz returned (${response.stop_reason})`);
    const problems = checkQuiz(parsed, chapterBlocks);
    if (problems.length === 0) out = parsed;
    else {
      console.warn(`quiz ${chapterId} attempt ${attempt}: ${problems.join("; ")}`);
      messages.push(
        { role: "assistant", content: JSON.stringify(parsed) },
        { role: "user", content: `Fix these problems and return the whole quiz again: ${problems.join("; ")}` },
      );
    }
  }
  if (!out) throw new Error("The quiz failed validation twice");

  const insert = db.prepare(
    "INSERT INTO quiz_questions (id, chapterId, question, options, answerIdx, explanation, misconceptions, blockId, atSec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare("DELETE FROM quiz_questions WHERE chapterId = ?").run(chapterId);
    for (const q of out.questions) {
      const id = randomUUID();
      const options = shuffleOptions(q.options, id);
      insert.run(
        id,
        chapterId,
        q.question,
        JSON.stringify(options.map((o) => o.text)),
        options.findIndex((o) => o.correct),
        q.explanation,
        JSON.stringify(options.map((o) => (o.correct ? null : o.misconception))),
        q.blockId,
        ctx.byId.get(q.blockId)!.startSec,
      );
    }
  })();
  return getQuiz(db, chapterId);
}
