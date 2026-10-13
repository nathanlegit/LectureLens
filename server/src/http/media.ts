import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serveFileWithRanges } from "./range.ts";

// IDs and file names are checked against strict patterns before touching the filesystem.
const LECTURE_ID = /^[a-z0-9-]{1,36}$/;
const FRAME_FILE = /^F\d{2,3}\.jpg$/;

export function mediaRoutes(dataDir: string) {
  const media = new Hono();

  media.get("/:lectureId/video", (c) => {
    const { lectureId } = c.req.param();
    const path = join(dataDir, lectureId, "video.mp4");
    if (!LECTURE_ID.test(lectureId) || !existsSync(path)) return c.notFound();
    return serveFileWithRanges(path, c.req.header("range"), "video/mp4");
  });

  media.get("/:lectureId/frames/:file", (c) => {
    const { lectureId, file } = c.req.param();
    const path = join(dataDir, lectureId, "frames", file);
    if (!LECTURE_ID.test(lectureId) || !FRAME_FILE.test(file) || !existsSync(path)) return c.notFound();
    const res = serveFileWithRanges(path, undefined, "image/jpeg");
    // Frame files are rewritten only when the frames stage reruns, which changes nothing a viewer has cached for long.
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  });

  return media;
}
