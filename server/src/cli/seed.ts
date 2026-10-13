// Ship a processed lecture to the deployed server.
//   npm run seed -- export <lectureId>               writes seed-<lectureId>.tar
//   npm run seed -- push <seed.tar> <https://server>  uploads it (uses UPLOAD_PASSCODE from .env)
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { config } from "../config.ts";
import { openDb } from "../db/db.ts";
import { exportSeed } from "../seed.ts";

const [command, a, b] = process.argv.slice(2);

async function main() {
  if (command === "export" && a) {
    const out = await exportSeed(openDb(config.DATA_DIR), config.DATA_DIR, a, `seed-${a}.tar`);
    console.log(`wrote ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
  } else if (command === "push" && a && b) {
    if (!config.UPLOAD_PASSCODE) throw new Error("Set UPLOAD_PASSCODE in .env to the deployed server's passcode");
    const size = statSync(a).size;
    console.log(`uploading ${(size / 1e6).toFixed(1)} MB to ${b} …`);
    const res = await fetch(new URL("/api/admin/import", b), {
      method: "POST",
      headers: { "x-passcode": config.UPLOAD_PASSCODE, "content-type": "application/x-tar", "content-length": String(size) },
      body: Readable.toWeb(createReadStream(a)) as ReadableStream,
      duplex: "half",
    } as RequestInit);
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${body}`);
    console.log(`imported: ${body}`);
  } else {
    throw new Error("usage: seed export <lectureId> | seed push <seed.tar> <https://server>");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
