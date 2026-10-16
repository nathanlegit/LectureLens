import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import type { DB } from "../db/db.ts";
import { parseSourceUrl } from "../pipeline/sources.ts";
import { UPLOAD_FILE } from "../pipeline/types.ts";
import { requirePasscode } from "./guard.ts";

class TooLarge extends Error {}

/** Counts bytes as they stream past and fails once the limit is crossed, before the disk fills. */
const byteLimit = (max: number) => {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      cb(seen > max ? new TooLarge() : null, chunk);
    },
  });
};

const NewModule = z.object({ name: z.string().trim().min(1).max(120) });
const Week = z.coerce.number().int().min(1).max(60);
const LectureEdit = z.object({ title: z.string().trim().min(1).max(200).optional(), week: Week.nullable().optional() });
const WeekEdit = z.object({ title: z.string().trim().max(80).nullable().optional() });
const FromLink = z.object({ url: z.string().trim().min(1).max(2000), title: z.string().trim().max(200).optional(), week: Week.nullable().optional() });

/** Writes: create modules, upload recordings, retry failed lectures. All behind the passcode. */
export function uploadRoutes(db: DB, dataDir: string) {
  const app = new Hono();
  app.use("*", requirePasscode);

  // Weeks are rows of their own so that empty weeks and week names persist.
  const ensureWeek = db.prepare("INSERT OR IGNORE INTO weeks (moduleId, week) VALUES (?, ?)");

  app.post("/modules", async (c) => {
    const parsed = NewModule.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "A module name is required" }, 400);
    const id = randomUUID().slice(0, 8);
    db.prepare("INSERT INTO modules (id, name) VALUES (?, ?)").run(id, parsed.data.name);
    return c.json({ id, name: parsed.data.name });
  });

  // The body is the raw video file (not multipart), streamed straight to disk.
  app.post("/modules/:moduleId/lectures", async (c) => {
    const moduleId = c.req.param("moduleId");
    if (!db.prepare("SELECT 1 FROM modules WHERE id = ?").get(moduleId)) return c.json({ error: "Module not found" }, 404);
    const title = (c.req.query("title") ?? "").trim().slice(0, 200) || "Untitled lecture";
    const weekParsed = Week.safeParse(c.req.query("week"));
    const week = weekParsed.success ? weekParsed.data : null;
    const maxBytes = config.MAX_UPLOAD_MB * 1024 ** 2;
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > maxBytes) return c.json({ error: `Recordings are limited to ${config.MAX_UPLOAD_MB} MB` }, 413);
    if (!c.req.raw.body) return c.json({ error: "Send the video file as the request body" }, 400);

    const id = randomUUID().slice(0, 8);
    const dir = join(dataDir, id);
    mkdirSync(dir, { recursive: true });
    try {
      await pipeline(Readable.fromWeb(c.req.raw.body as NodeWebStream), byteLimit(maxBytes), createWriteStream(join(dir, UPLOAD_FILE)));
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      if (err instanceof TooLarge) return c.json({ error: `Recordings are limited to ${config.MAX_UPLOAD_MB} MB` }, 413);
      console.error("upload failed", err);
      return c.json({ error: "The upload was interrupted. Try again." }, 400);
    }
    // Only now does the lecture exist for the job runner: it never sees a half-written file.
    db.prepare("INSERT INTO lectures (id, moduleId, title, status, week) VALUES (?, ?, ?, 'queued', ?)").run(id, moduleId, title, week);
    if (week !== null) ensureWeek.run(moduleId, week);
    return c.json({ id, title });
  });

  // Import from a YouTube link. The lecture exists at once; the job runner downloads it.
  app.post("/modules/:moduleId/lectures/from-link", async (c) => {
    const moduleId = c.req.param("moduleId");
    if (!db.prepare("SELECT 1 FROM modules WHERE id = ?").get(moduleId)) return c.json({ error: "Module not found" }, 404);
    if (!config.LINK_IMPORT) return c.json({ error: "YouTube import is off on this server. Download the video and upload the file instead." }, 403);
    const parsed = FromLink.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Paste a YouTube link" }, 400);
    if (!parseSourceUrl(parsed.data.url)) {
      return c.json({ error: "That isn't a YouTube video link. Playlists aren't supported." }, 400);
    }
    const id = randomUUID().slice(0, 8);
    mkdirSync(join(dataDir, id), { recursive: true });
    const week = parsed.data.week ?? null;
    // An empty title means "use the video's own name once it's known".
    db.prepare("INSERT INTO lectures (id, moduleId, title, status, week, sourceUrl) VALUES (?, ?, ?, 'queued', ?, ?)").run(
      id,
      moduleId,
      parsed.data.title ?? "",
      week,
      parsed.data.url,
    );
    if (week !== null) ensureWeek.run(moduleId, week);
    return c.json({ id });
  });

  app.post("/lectures/:id/retry", (c) => {
    const id = c.req.param("id");
    const row = db.prepare("SELECT status, failedStage, sourceUrl FROM lectures WHERE id = ?").get(id) as
      | { status: string; failedStage: string | null; sourceUrl: string | null }
      | undefined;
    if (!row) return c.json({ error: "Lecture not found" }, 404);
    if (row.status !== "failed" || !row.failedStage) return c.json({ error: "Only a failed lecture can be retried" }, 409);
    if (row.failedStage === "ingest" && !row.sourceUrl && !existsSync(join(dataDir, id, UPLOAD_FILE)) && !existsSync(join(dataDir, id, "video.mp4"))) {
      return c.json({ error: "The uploaded file is gone; upload the recording again" }, 409);
    }
    db.prepare("UPDATE lectures SET status = failedStage, failedStage = NULL, error = NULL WHERE id = ?").run(id);
    return c.json({ ok: true });
  });

  // Rename a lecture or move it to another week.
  app.post("/lectures/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = LectureEdit.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid title or week" }, 400);
    if (!db.prepare("SELECT 1 FROM lectures WHERE id = ?").get(id)) return c.json({ error: "Lecture not found" }, 404);
    const { title, week } = parsed.data;
    if (title !== undefined) db.prepare("UPDATE lectures SET title = ? WHERE id = ?").run(title, id);
    if (week !== undefined) {
      db.prepare("UPDATE lectures SET week = ? WHERE id = ?").run(week, id);
      if (week !== null) {
        const { moduleId } = db.prepare("SELECT moduleId FROM lectures WHERE id = ?").get(id) as { moduleId: string };
        ensureWeek.run(moduleId, week);
      }
    }
    return c.json({ ok: true });
  });

  app.post("/modules/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = NewModule.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "A module name is required" }, 400);
    const res = db.prepare("UPDATE modules SET name = ? WHERE id = ?").run(parsed.data.name, id);
    if (res.changes === 0) return c.json({ error: "Module not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/modules/:id/delete", (c) => {
    const id = c.req.param("id");
    const lectures = db.prepare("SELECT id, status FROM lectures WHERE moduleId = ?").all(id) as { id: string; status: string }[];
    if (lectures.some((l) => !["ready", "failed", "queued"].includes(l.status))) {
      return c.json({ error: "A lecture in this module is being processed. Wait for it to finish, then delete the module." }, 409);
    }
    db.prepare("DELETE FROM modules WHERE id = ?").run(id); // cascades to lectures, weeks and their rows
    for (const l of lectures) rmSync(join(dataDir, l.id), { recursive: true, force: true });
    return c.json({ ok: true });
  });

  // Create a week, or rename it (title null or "" resets it to "Week N").
  app.post("/modules/:id/weeks/:week", async (c) => {
    const id = c.req.param("id");
    const week = Week.safeParse(c.req.param("week"));
    const parsed = WeekEdit.safeParse(await c.req.json().catch(() => ({})));
    if (!week.success || !parsed.success) return c.json({ error: "Invalid week" }, 400);
    if (!db.prepare("SELECT 1 FROM modules WHERE id = ?").get(id)) return c.json({ error: "Module not found" }, 404);
    ensureWeek.run(id, week.data);
    if (parsed.data.title !== undefined) {
      db.prepare("UPDATE weeks SET title = ? WHERE moduleId = ? AND week = ?").run(parsed.data.title || null, id, week.data);
    }
    return c.json({ ok: true });
  });

  // Delete a week; its lectures are kept and move to "No week".
  app.post("/modules/:id/weeks/:week/delete", (c) => {
    const id = c.req.param("id");
    const week = Week.safeParse(c.req.param("week"));
    if (!week.success) return c.json({ error: "Invalid week" }, 400);
    db.transaction(() => {
      db.prepare("UPDATE lectures SET week = NULL WHERE moduleId = ? AND week = ?").run(id, week.data);
      db.prepare("DELETE FROM weeks WHERE moduleId = ? AND week = ?").run(id, week.data);
    })();
    return c.json({ ok: true });
  });

  app.post("/lectures/:id/delete", (c) => {
    const id = c.req.param("id");
    const row = db.prepare("SELECT status FROM lectures WHERE id = ?").get(id) as { status: string } | undefined;
    if (!row) return c.json({ error: "Lecture not found" }, 404);
    if (!["ready", "failed", "queued"].includes(row.status)) {
      return c.json({ error: "This lecture is being processed. Wait for it to finish, then delete it." }, 409);
    }
    db.prepare("DELETE FROM lectures WHERE id = ?").run(id); // cascades to its rows
    rmSync(join(dataDir, id), { recursive: true, force: true });
    return c.json({ ok: true });
  });

  return app;
}
