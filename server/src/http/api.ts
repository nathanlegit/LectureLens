import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AskEvent, Chapter, ChatMessage, Lecture, LectureDetail, Module, ModuleWithLectures, Quiz, QuizNotCovered, Segment, WeekInfo } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { ask } from "../llm/ask.ts";
import { generateQuiz, listQuizzes } from "../llm/quiz.ts";
import { toVtt } from "./captions.ts";
import { rateLimit, spendCap } from "./guard.ts";

type LectureRowDb = Omit<Lecture, "isSeed"> & { isSeed: number };
const toLecture = ({ isSeed, ...rest }: LectureRowDb): Lecture => ({ ...rest, isSeed: isSeed === 1 });
const LECTURE_COLS = `id, moduleId, title, durationSec, status, failedStage, error, stageDone, stageTotal, isSeed, createdAt, week, summary,
  (SELECT f.id FROM frames f WHERE f.lectureId = lectures.id ORDER BY abs(f.atSec - lectures.durationSec * 0.15) LIMIT 1) AS thumbFrameId`;

const AskBody = z.object({ question: z.string().trim().min(1).max(2000), mode: z.enum(["tell", "guide"]).default("tell") });
const QuizBody = z.object({ topic: z.string().trim().min(1).max(300), count: z.coerce.number().int().min(3).max(10).default(5) });

export function apiRoutes(db: DB) {
  const api = new Hono();
  const askLimit = rateLimit("question", 10, 60_000);
  const quizLimit = rateLimit("quiz", 5, 60_000);
  const cap = spendCap(db);
  // One generation per lecture and topic at a time: a double click must not pay twice.
  const quizInFlight = new Map<string, Promise<Quiz | QuizNotCovered>>();

  api.get("/modules", (c) => {
    const modules = db.prepare("SELECT id, name, glossary, createdAt FROM modules ORDER BY createdAt").all() as Module[];
    const lectures = (db.prepare(`SELECT ${LECTURE_COLS} FROM lectures ORDER BY week IS NULL, week, createdAt`).all() as LectureRowDb[]).map(toLecture);
    const weeks = db.prepare("SELECT moduleId, week, title FROM weeks ORDER BY week").all() as (WeekInfo & { moduleId: string })[];
    const body: ModuleWithLectures[] = modules.map((m) => ({
      ...m,
      lectures: lectures.filter((l) => l.moduleId === m.id),
      weeks: weeks.filter((w) => w.moduleId === m.id).map(({ week, title }) => ({ week, title })),
    }));
    return c.json(body);
  });

  api.get("/lectures/:id", (c) => {
    const id = c.req.param("id");
    const row = db.prepare(`SELECT ${LECTURE_COLS} FROM lectures WHERE id = ?`).get(id) as LectureRowDb | undefined;
    if (!row) return c.json({ error: "Lecture not found" }, 404);
    const body: LectureDetail = {
      lecture: toLecture(row),
      chapters: db
        .prepare("SELECT id, idx, title, startBlockId, startSec, endSec, summary FROM chapters WHERE lectureId = ? ORDER BY idx")
        .all(id) as Chapter[],
      frames: db.prepare("SELECT id, atSec, kind FROM frames WHERE lectureId = ? ORDER BY atSec").all(id) as LectureDetail["frames"],
    };
    return c.json(body);
  });

  api.get("/lectures/:id/messages", (c) => {
    const rows = db
      .prepare("SELECT id, role, content, citations, mode FROM messages WHERE lectureId = ? ORDER BY createdAt, rowid")
      .all(c.req.param("id")) as (Omit<ChatMessage, "citations"> & { citations: string })[];
    return c.json(rows.map((r): ChatMessage => ({ ...r, citations: JSON.parse(r.citations) })));
  });

  api.post("/lectures/:id/ask", askLimit, cap, async (c) => {
    const id = c.req.param("id");
    const parsed = AskBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "A question is required" }, 400);
    const lecture = db.prepare("SELECT status FROM lectures WHERE id = ?").get(id) as { status: string } | undefined;
    if (!lecture) return c.json({ error: "Lecture not found" }, 404);
    if (lecture.status !== "ready") return c.json({ error: "This lecture is still processing" }, 409);

    return streamSSE(c, async (stream) => {
      // ask() emits synchronously; chain the writes so they go out in order and all land before the stream closes.
      let writes = Promise.resolve();
      const send = (e: AskEvent) => {
        writes = writes.then(() => stream.writeSSE({ event: e.type, data: JSON.stringify(e) }));
      };
      try {
        await ask(db, id, parsed.data.question, send, { mode: parsed.data.mode });
      } catch (err) {
        console.error(`ask ${id} failed`, err);
        send({ type: "error", message: "Something went wrong answering that. Try again." });
      }
      await writes;
    });
  });

  // Anyone can start a fresh conversation; the chat is shared by everyone viewing this lecture.
  api.post("/lectures/:id/messages/clear", askLimit, (c) => {
    db.prepare("DELETE FROM messages WHERE lectureId = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });

  const segments = (id: string) =>
    db.prepare("SELECT startSec, endSec, text FROM transcript_segments WHERE lectureId = ? ORDER BY startSec").all(id) as Segment[];

  api.get("/lectures/:id/transcript", (c) => c.json(segments(c.req.param("id"))));

  api.get("/lectures/:id/captions.vtt", (c) => {
    c.header("Content-Type", "text/vtt; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return c.body(toVtt(segments(c.req.param("id"))));
  });

  api.get("/lectures/:id/quizzes", (c) => c.json(listQuizzes(db, c.req.param("id"))));

  // A new quiz on any topic. Returns the quiz, or { notCovered } when the lecture doesn't cover the topic.
  api.post("/lectures/:id/quizzes", quizLimit, cap, async (c) => {
    const id = c.req.param("id");
    const parsed = QuizBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Say what the quiz should be about" }, 400);
    const lecture = db.prepare("SELECT status FROM lectures WHERE id = ?").get(id) as { status: string } | undefined;
    if (!lecture) return c.json({ error: "Lecture not found" }, 404);
    if (lecture.status !== "ready") return c.json({ error: "This lecture is still processing" }, 409);
    const { topic, count } = parsed.data;
    const key = `${id}\n${topic.toLowerCase()}\n${count}`;
    let job = quizInFlight.get(key);
    if (!job) {
      job = generateQuiz(db, id, topic, count).finally(() => quizInFlight.delete(key));
      quizInFlight.set(key, job);
    }
    try {
      return c.json(await job);
    } catch (err) {
      console.error(`quiz ${id} failed`, err);
      return c.json({ error: "Couldn't write that quiz. Try again, or rephrase the topic." }, 502);
    }
  });

  return api;
}
