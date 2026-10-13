import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AskEvent, Chapter, ChatMessage, Lecture, LectureDetail, Module, ModuleWithLectures } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { ask } from "../llm/ask.ts";

type LectureRowDb = Omit<Lecture, "isSeed"> & { isSeed: number };
const toLecture = ({ isSeed, ...rest }: LectureRowDb): Lecture => ({ ...rest, isSeed: isSeed === 1 });
const LECTURE_COLS = "id, moduleId, title, durationSec, status, failedStage, error, stageDone, stageTotal, isSeed, createdAt";

const AskBody = z.object({ question: z.string().trim().min(1).max(2000) });

export function apiRoutes(db: DB) {
  const api = new Hono();

  api.get("/modules", (c) => {
    const modules = db.prepare("SELECT id, name, glossary, createdAt FROM modules ORDER BY createdAt").all() as Module[];
    const lectures = (db.prepare(`SELECT ${LECTURE_COLS} FROM lectures ORDER BY createdAt`).all() as LectureRowDb[]).map(toLecture);
    const body: ModuleWithLectures[] = modules.map((m) => ({ ...m, lectures: lectures.filter((l) => l.moduleId === m.id) }));
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
      .prepare("SELECT id, role, content, citations FROM messages WHERE lectureId = ? ORDER BY createdAt, rowid")
      .all(c.req.param("id")) as (Omit<ChatMessage, "citations"> & { citations: string })[];
    return c.json(rows.map((r): ChatMessage => ({ ...r, citations: JSON.parse(r.citations) })));
  });

  api.post("/lectures/:id/ask", async (c) => {
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
        await ask(db, id, parsed.data.question, send);
      } catch (err) {
        console.error(`ask ${id} failed`, err);
        send({ type: "error", message: "Something went wrong answering that. Try again." });
      }
      await writes;
    });
  });

  return api;
}
