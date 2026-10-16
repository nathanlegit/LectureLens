// Milestone 1 CLI: run the pipeline on a file and inspect the output by hand.
//   npm run pipeline -- run <video.mp4 | YouTube link> [--title "..."] [--module <id>]
//   npm run pipeline -- rerun <lectureId> <stage>     (describe --force clears descriptions first)
//   npm run pipeline -- inspect <lectureId>          (writes an HTML contact sheet)
//   npm run pipeline -- tune <lectureId> [--tCut 12 --tGrad 6 --eps 1.5 --window 7]
//   npm run pipeline -- usage                       (token spend so far)
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { STAGES, type Frame, type Segment, type Stage } from "@lecture-lens/shared";
import { config } from "../config.ts";
import { openDb } from "../db/db.ts";
import { runStages } from "../jobs/runStages.ts";
import { extractFrame, loadSamples } from "../pipeline/frames.ts";
import { selectFrames, type SelectOptions } from "../pipeline/frameSelect.ts";
import { buildTimeline, formatTime } from "../pipeline/timeline.ts";
import { parseSourceUrl } from "../pipeline/sources.ts";
import { UPLOAD_FILE } from "../pipeline/types.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: "string" },
    module: { type: "string", default: "dev" },
    force: { type: "boolean", default: false },
    tCut: { type: "string" },
    tGrad: { type: "string" },
    eps: { type: "string" },
    window: { type: "string" },
  },
});
const [command, arg1, arg2] = positionals;
const db = openDb(config.DATA_DIR);
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

async function main() {
  switch (command) {
    case "run": {
      if (!arg1) throw new Error("usage: run <video.mp4 | YouTube link>");
      db.prepare("INSERT OR IGNORE INTO modules (id, name) VALUES (?, ?)").run(values.module, "Development");
      const id = randomUUID().slice(0, 8);
      const dir = join(config.DATA_DIR, id);
      mkdirSync(dir, { recursive: true });
      if (/^https?:\/\//i.test(arg1)) {
        // A YouTube link: ingest downloads it, and the video's own name becomes the title.
        if (!parseSourceUrl(arg1)) throw new Error("That isn't a YouTube video link");
        db.prepare("INSERT INTO lectures (id, moduleId, title, sourceUrl) VALUES (?, ?, ?, ?)").run(id, values.module, values.title ?? "", arg1);
      } else {
        copyFileSync(resolve(arg1), join(dir, UPLOAD_FILE));
        db.prepare("INSERT INTO lectures (id, moduleId, title) VALUES (?, ?, ?)").run(id, values.module, values.title ?? basename(arg1));
      }
      log(`lecture ${id}`);
      await runStages(db, id, { dataDir: config.DATA_DIR, log });
      log(`done. Inspect with: npm run pipeline -- inspect ${id}`);
      break;
    }
    case "rerun": {
      const stage = arg2 as Stage;
      if (!arg1 || !STAGES.includes(stage)) throw new Error(`usage: rerun <lectureId> <${STAGES.join("|")}>`);
      if (stage === "describe" && values.force) db.prepare("UPDATE frames SET description = NULL WHERE lectureId = ?").run(arg1);
      db.prepare("UPDATE lectures SET status = ?, failedStage = NULL, error = NULL WHERE id = ?").run(stage, arg1);
      await runStages(db, arg1, { dataDir: config.DATA_DIR, log });
      break;
    }
    case "inspect": {
      if (!arg1) throw new Error("usage: inspect <lectureId>");
      const { durationSec } = db.prepare("SELECT durationSec FROM lectures WHERE id = ?").get(arg1) as { durationSec: number };
      const frames = db.prepare("SELECT id, atSec, kind, description, imagePath FROM frames WHERE lectureId = ? ORDER BY atSec").all(arg1) as (Frame & { imagePath: string })[];
      const segments = db.prepare("SELECT startSec, endSec, text FROM transcript_segments WHERE lectureId = ?").all(arg1) as Segment[];
      const blocks = buildTimeline(frames, segments, durationSec);
      const rows = blocks.map((b, i) => {
        const f = frames[i]!;
        return `<tr><td><b>${b.id}</b><br>${formatTime(f.atSec)}<br><i>${f.kind}</i></td>
<td><img src="frames/${b.id}.jpg"></td>
<td><pre>${escapeHtml(b.screen)}</pre></td>
<td class="said">${escapeHtml(b.said)}</td></tr>`;
      });
      const out = join(config.DATA_DIR, arg1, "inspect.html");
      writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Inspect ${arg1}</title>
<style>body{font:13px system-ui;margin:16px}td{vertical-align:top;border-top:1px solid #ccc;padding:6px}img{width:420px}pre{white-space:pre-wrap;max-width:420px;margin:0}.said{max-width:380px;color:#444}</style>
<p>${frames.length} frames over ${formatTime(durationSec)}</p><table>${rows.join("")}</table>`);
      log(`wrote ${out}`);
      break;
    }
    case "tune": {
      if (!arg1) throw new Error("usage: tune <lectureId>");
      const dir = join(config.DATA_DIR, arg1);
      const opts: Partial<SelectOptions> = {};
      for (const k of ["tCut", "tGrad", "eps", "window"] as const) if (values[k]) opts[k] = Number(values[k]);
      const kept = selectFrames(await loadSamples(dir), opts);
      const counts = Object.groupBy(kept, (k) => k.kind);
      log(`${kept.length} frames: ${Object.entries(counts).map(([k, v]) => `${k} ${v!.length}`).join(", ")}`);
      const tuneDir = join(dir, "tune");
      mkdirSync(tuneDir, { recursive: true });
      const cells: string[] = [];
      for (const k of kept) {
        const file = `t${k.index}.jpg`;
        await extractFrame(join(dir, "video.mp4"), k.index, join(tuneDir, file), 320);
        cells.push(`<figure><img src="tune/${file}"><figcaption>${formatTime(k.index)} ${k.kind}</figcaption></figure>`);
      }
      const out = join(dir, "tune.html");
      writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Tune ${arg1}</title>
<style>body{font:12px system-ui;margin:16px;display:flex;flex-wrap:wrap;gap:8px}figure{margin:0}img{width:240px;display:block}</style>
<p style="width:100%">${JSON.stringify(opts)} → ${kept.length} frames</p>${cells.join("")}`);
      log(`wrote ${out}`);
      break;
    }
    case "usage": {
      const rows = db.prepare(
        "SELECT route, model, COUNT(*) calls, SUM(inputTok) inp, SUM(cacheReadTok) cr, SUM(cacheWriteTok) cw, SUM(outputTok) outp FROM usage_log GROUP BY route, model",
      ).all();
      console.table(rows);
      break;
    }
    default:
      throw new Error("commands: run | rerun | inspect | tune | usage");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
