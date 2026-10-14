import { createHash, randomUUID } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Quiz, QuizNotCovered, QuizQuestion } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { anthropic, logUsage, MODELS } from "./client.ts";
import { loadLectureContext, timelineSystem } from "./lectureContext.ts";

const QuizSchema = z.object({
  covered: z.boolean(),
  notCoveredReason: z.string().nullable(),
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

const INSTRUCTIONS = `You write retrieval-practice quizzes on this lecture, on whatever topic the student asks for, to check understanding rather than recall of wording.
- The topic may be anything: a concept, an example, a time range ("what was covered between 12:00 and 20:00"), or the whole lecture. Use every part of the timeline that is relevant, not just one chapter.
- If the lecture does not cover the topic at all, set "covered" to false, give "notCoveredReason" as one sentence naming the closest thing the lecture does cover, and return no questions. Otherwise "covered" is true and "notCoveredReason" is null.
- Each question has exactly 4 options and exactly one correct option.
- Ask about ideas, steps and results the student should be able to reproduce (what an equation means, what happens if something changes, which picture shows what), not trivia about what the lecturer said.
- Every wrong option must be a real misconception a student could hold about this material, not a random distractor. Give each wrong option a one-sentence "misconception" note naming the mix-up, written to the student ("You may be mixing up..."). The correct option has misconception null.
- "explanation": 1 to 2 sentences on why the correct answer is right.
- "blockId": the block where the lecture shows the answer.
- Order questions from the most basic to the most demanding.
- Use LaTeX in $...$ for maths in questions, options and notes.`;

/** Returns a list of problems, empty when the quiz is usable. */
export function checkQuiz(out: QuizOutput, blocks: Set<string>, count: number): string[] {
  if (!out.covered) return out.notCoveredReason?.trim() ? [] : ["covered is false but notCoveredReason is empty"];
  const problems: string[] = [];
  if (out.questions.length < Math.max(1, count - 1) || out.questions.length > count) {
    problems.push(`expected ${count} questions, got ${out.questions.length}`);
  }
  out.questions.forEach((q, i) => {
    const n = i + 1;
    if (q.options.length !== 4) problems.push(`question ${n} has ${q.options.length} options, not 4`);
    const correct = q.options.filter((o) => o.correct).length;
    if (correct !== 1) problems.push(`question ${n} has ${correct} correct options, not 1`);
    if (q.options.some((o) => !o.correct && !o.misconception?.trim())) problems.push(`question ${n} has a wrong option without a misconception note`);
    if (!blocks.has(q.blockId)) problems.push(`question ${n} cites ${q.blockId}, which is not a block in this lecture`);
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

type ItemRow = Omit<QuizQuestion, "options" | "misconceptions"> & { quizId: string; options: string; misconceptions: string };

/** Recent quizzes for a lecture, newest first, with their questions. */
export function listQuizzes(db: DB, lectureId: string, limit = 8): Quiz[] {
  const quizzes = db
    .prepare("SELECT id, topic, createdAt FROM quizzes WHERE lectureId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?")
    .all(lectureId, limit) as Omit<Quiz, "questions">[];
  if (quizzes.length === 0) return [];
  const items = db
    .prepare(
      `SELECT id, quizId, question, options, answerIdx, explanation, misconceptions, blockId, atSec FROM quiz_items
       WHERE quizId IN (${quizzes.map(() => "?").join(",")}) ORDER BY idx`,
    )
    .all(...quizzes.map((q) => q.id)) as ItemRow[];
  return quizzes.map((q) => ({
    ...q,
    questions: items
      .filter((i) => i.quizId === q.id)
      .map(({ quizId: _, ...i }) => ({ ...i, options: JSON.parse(i.options), misconceptions: JSON.parse(i.misconceptions) })),
  }));
}

/** Writes and stores a quiz on any topic in this lecture, or explains that the lecture doesn't cover it. */
export async function generateQuiz(db: DB, lectureId: string, topic: string, count: number): Promise<Quiz | QuizNotCovered> {
  const ctx = loadLectureContext(db, lectureId);
  const blocks = new Set(ctx.byId.keys());
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: `Write a quiz of ${count} questions on: ${topic}` },
  ];

  let out: QuizOutput | null = null;
  for (let attempt = 1; attempt <= 2 && !out; attempt++) {
    const response = await anthropic.beta.messages.parse({
      model: MODELS.reasoning,
      max_tokens: 12000,
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
    const problems = checkQuiz(parsed, blocks, count);
    if (problems.length === 0) out = parsed;
    else {
      console.warn(`quiz ${lectureId} attempt ${attempt}: ${problems.join("; ")}`);
      messages.push(
        { role: "assistant", content: JSON.stringify(parsed) },
        { role: "user", content: `Fix these problems and return the whole quiz again: ${problems.join("; ")}` },
      );
    }
  }
  if (!out) throw new Error("The quiz failed validation twice");
  if (!out.covered) return { notCovered: out.notCoveredReason ?? "This lecture doesn't cover that topic." };

  const quizId = randomUUID();
  const insertItem = db.prepare(
    "INSERT INTO quiz_items (id, quizId, idx, question, options, answerIdx, explanation, misconceptions, blockId, atSec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    db.prepare("INSERT INTO quizzes (id, lectureId, topic) VALUES (?, ?, ?)").run(quizId, lectureId, topic);
    out.questions.forEach((q, idx) => {
      const id = randomUUID();
      const options = shuffleOptions(q.options, id);
      insertItem.run(
        id,
        quizId,
        idx,
        q.question,
        JSON.stringify(options.map((o) => o.text)),
        options.findIndex((o) => o.correct),
        q.explanation,
        JSON.stringify(options.map((o) => (o.correct ? null : o.misconception))),
        q.blockId,
        ctx.byId.get(q.blockId)!.startSec,
      );
    });
  })();
  return listQuizzes(db, lectureId, 1)[0]!;
}
