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

/** Writes: create modules, upload recordings, retry failed lectures. All behind the passcode. */
export function uploadRoutes(db: DB, dataDir: string) {
  const app = new Hono();
  app.use("*", requirePasscode);

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
    db.prepare("INSERT INTO lectures (id, moduleId, title, status) VALUES (?, ?, ?, 'queued')").run(id, moduleId, title);
    return c.json({ id, title });
  });

  app.post("/lectures/:id/retry", (c) => {
    const id = c.req.param("id");
    const row = db.prepare("SELECT status, failedStage FROM lectures WHERE id = ?").get(id) as
      | { status: string; failedStage: string | null }
      | undefined;
    if (!row) return c.json({ error: "Lecture not found" }, 404);
    if (row.status !== "failed" || !row.failedStage) return c.json({ error: "Only a failed lecture can be retried" }, 409);
    if (row.failedStage === "ingest" && !existsSync(join(dataDir, id, UPLOAD_FILE)) && !existsSync(join(dataDir, id, "video.mp4"))) {
      return c.json({ error: "The uploaded file is gone; upload the recording again" }, 409);
    }
    db.prepare("UPDATE lectures SET status = failedStage, failedStage = NULL, error = NULL WHERE id = ?").run(id);
    return c.json({ ok: true });
  });

  return app;
}
