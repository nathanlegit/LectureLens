import { createWriteStream, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { DB } from "../db/db.ts";
import { importSeed } from "../seed.ts";
import { requirePasscode } from "./guard.ts";

export function adminRoutes(db: DB, dataDir: string) {
  const admin = new Hono();
  admin.use("*", requirePasscode);

  // Body is a seed .tar from `npm run seed -- export`, streamed to disk rather than held in memory.
  admin.post("/import", async (c) => {
    if (!c.req.raw.body) return c.json({ error: "Send the seed archive as the request body" }, 400);
    const archive = join(dataDir, `.upload-${randomUUID().slice(0, 8)}.tar`);
    try {
      await pipeline(Readable.fromWeb(c.req.raw.body as import("node:stream/web").ReadableStream), createWriteStream(archive));
      const lectureId = await importSeed(db, dataDir, archive);
      return c.json({ lectureId });
    } catch (err) {
      console.error("seed import failed", err);
      return c.json({ error: err instanceof Error ? err.message : "Import failed" }, 400);
    } finally {
      rmSync(archive, { force: true });
    }
  });

  // Rerun the chapter stage of a finished lecture (after a prompt change). The job runner picks it
  // up within a couple of seconds, since a lecture's status is the stage it is in.
  admin.post("/lectures/:id/rechapter", (c) => {
    const res = db.prepare("UPDATE lectures SET status = 'chapter', stageDone = 0, stageTotal = 0 WHERE id = ? AND status = 'ready'").run(c.req.param("id"));
    if (res.changes === 0) return c.json({ error: "No finished lecture with that ID" }, 404);
    return c.json({ ok: true });
  });

  return admin;
}
