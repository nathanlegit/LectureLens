import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "./config.ts";
import { openDb } from "./db/db.ts";
import { adminRoutes } from "./http/admin.ts";
import { apiRoutes } from "./http/api.ts";
import { mediaRoutes } from "./http/media.ts";
import { uploadRoutes } from "./http/uploads.ts";
import { startJobRunner } from "./jobs/runner.ts";

const db = openDb(config.DATA_DIR);
const app = new Hono();
app.use("/api/*", logger());

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/admin", adminRoutes(db, config.DATA_DIR));
app.route("/api/write", uploadRoutes(db, config.DATA_DIR));
app.route("/api", apiRoutes(db));
app.route("/media", mediaRoutes(config.DATA_DIR));

// In production the server also serves the built web app, with client-side routes falling back to index.html.
const webDist = resolve(import.meta.dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use("/*", serveStatic({ root: webDist }));
  // Read per request, not at boot: a rebuild renames the hashed assets index.html points at.
  app.get("*", (c) => {
    c.header("Cache-Control", "no-cache");
    return c.html(readFileSync(resolve(webDist, "index.html"), "utf8"));
  });
}

startJobRunner(db, config.DATA_DIR);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Lecture Lens server on http://localhost:${info.port}`);
});
