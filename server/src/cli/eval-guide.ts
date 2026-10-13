// Teaching eval for Guide me (PRD: Teaching approach). Runs each case as a fresh conversation in a
// throwaway copy of the database, then has Claude grade the replies against the rubric.
//   npm run eval:guide            (Strang 18.06 lecture 1, id 554168f0; costs roughly $0.30-0.50)
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.ts";
import { openDb } from "../db/db.ts";
import { ask } from "../llm/ask.ts";
import { anthropic, MODELS } from "../llm/client.ts";
import { loadLectureContext } from "../llm/lectureContext.ts";

const LECTURE = "554168f0";

interface Case {
  question: string;
  answer: string;
  wrongAttempt?: string;
}

const CASES: Case[] = [
  { question: "In the 2x2 example, which combination of the columns gives b?", answer: "1 of column 1 plus 2 of column 2 (x=1, y=2)", wrongAttempt: "2 of column 1 and 1 of column 2?" },
  { question: "Where do the two lines in the 2x2 row picture meet?", answer: "At the point x=1, y=2", wrongAttempt: "At (2, 1)?" },
  { question: "What is the solution of the 3x3 system?", answer: "x=0, y=0, z=1, because b equals column 3", wrongAttempt: "x=1, y=1, z=1?" },
  { question: "Why is the 3x3 solution easy to see in the column picture?", answer: "Because b is exactly the third column, so take none of columns 1 and 2 and one of column 3" },
  { question: "What is the coefficient matrix A of the 2x2 system?", answer: "A = [[2, -1], [-1, 2]]", wrongAttempt: "[[2, -1], [1, 2]]?" },
  { question: "If b is changed to (1, 1, -3), what solves the 3x3 system?", answer: "x=1, y=1, z=0, because b is column 1 plus column 2" },
  { question: "Can Ax = b be solved for every b with this 3x3 matrix?", answer: "Yes: the columns' combinations fill 3D space (A is invertible)" },
  { question: "When would a 3x3 system fail to be solvable for every b?", answer: "When the three columns lie in one plane (e.g. column 3 = column 1 + column 2), so A is singular" },
  { question: "What is [[2, 5], [1, 3]] times [1, 2]?", answer: "[12, 7], as 1 times column 1 plus 2 times column 2", wrongAttempt: "[7, 12]?" },
  { question: "How does the lecture say to think of A times x?", answer: "As a combination of the columns of A" },
];

const Grade = z.object({
  revealsAnswer: z.boolean(),
  citesRelevantBlock: z.boolean(),
  endsWithQuestionOrTask: z.boolean(),
  namesSpecificMisconception: z.boolean().nullable(),
  notes: z.string(),
});
type Grade = z.infer<typeof Grade>;

async function grade(c: Case, reply: string, citedScreens: string, attempt?: string): Promise<Grade> {
  const res = await anthropic.messages.parse({
    model: MODELS.reasoning,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Grade) },
    messages: [
      {
        role: "user",
        content: `You grade one reply from a tutor in "Guide me" mode, which must help a student work an answer out without handing it over.

Student question: ${c.question}
Reference answer (the student must NOT be told this yet): ${c.answer}
${attempt ? `The student just attempted (wrongly): ${attempt}\n` : ""}
Tutor reply:
"""
${reply}
"""

What the cited blocks show on screen:
${citedScreens || "(no citations)"}

Grade:
- revealsAnswer: true if the reply states the reference answer or makes it trivially readable (pointing at where it is written does not count as stating it).
- citesRelevantBlock: true if at least one cited block actually shows content needed for this question.
- endsWithQuestionOrTask: true if the reply ends by asking the student something or giving them something to try.
- namesSpecificMisconception: only when the student attempted: true if the reply names what they specifically mixed up (not a generic "not quite"); otherwise null.
- notes: one short sentence.`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error(`grader returned nothing (${res.stop_reason})`);
  return res.parsed_output;
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "lecture-lens-eval-"));
  copyFileSync(join(config.DATA_DIR, "lecture-lens.sqlite"), join(tmp, "lecture-lens.sqlite"));
  const db = openDb(tmp);
  const ctx = loadLectureContext(db, LECTURE);
  const screens = (ids: string[]) => [...new Set(ids)].map((id) => `[${id}] ${ctx.byId.get(id)?.screen ?? ""}`).join("\n");
  const ok = (b: boolean | null) => (b === null ? "  -  " : b ? " yes " : " NO  ");

  const totals = { first: 0, firstNoReveal: 0, firstCites: 0, firstAsks: 0, wrong: 0, wrongNoReveal: 0, wrongNames: 0 };
  try {
    for (const [i, c] of CASES.entries()) {
      db.prepare("DELETE FROM messages WHERE lectureId = ?").run(LECTURE);
      const first = await ask(db, LECTURE, c.question, () => {}, { mode: "guide" });
      const g1 = await grade(c, first.answer, screens(first.citations.map((x) => x.id)));
      totals.first++;
      totals.firstNoReveal += +!g1.revealsAnswer;
      totals.firstCites += +g1.citesRelevantBlock;
      totals.firstAsks += +g1.endsWithQuestionOrTask;
      console.log(`${String(i + 1).padStart(2)} first  | no reveal${ok(!g1.revealsAnswer)}| cites${ok(g1.citesRelevantBlock)}| asks${ok(g1.endsWithQuestionOrTask)}| ${g1.notes}`);

      if (c.wrongAttempt) {
        const second = await ask(db, LECTURE, c.wrongAttempt, () => {}, { mode: "guide" });
        const g2 = await grade(c, second.answer, screens(second.citations.map((x) => x.id)), c.wrongAttempt);
        totals.wrong++;
        totals.wrongNoReveal += +!g2.revealsAnswer;
        totals.wrongNames += +!!g2.namesSpecificMisconception;
        console.log(`${String(i + 1).padStart(2)} wrong  | no reveal${ok(!g2.revealsAnswer)}| names mix-up${ok(g2.namesSpecificMisconception)}| ${g2.notes}`);
      }
    }
    const pct = (n: number, d: number) => `${n}/${d}`;
    console.log(`\nFirst replies: no reveal ${pct(totals.firstNoReveal, totals.first)}, relevant citation ${pct(totals.firstCites, totals.first)}, ends with a question ${pct(totals.firstAsks, totals.first)}`);
    console.log(`Wrong attempts: no reveal ${pct(totals.wrongNoReveal, totals.wrong)}, names the mix-up ${pct(totals.wrongNames, totals.wrong)}`);
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
