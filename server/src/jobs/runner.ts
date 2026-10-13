import { STAGES } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { runStages } from "./runStages.ts";

const ACTIVE = ["queued", ...STAGES];

/**
 * Processes lectures one at a time in the background. A lecture's status is the stage it is in,
 * and every stage can be rerun from its start, so a lecture left mid-stage by a restart is simply
 * picked up again: crash recovery needs no extra state.
 */
export function startJobRunner(db: DB, dataDir: string, intervalMs = 2000) {
  const next = db.prepare(
    `SELECT id FROM lectures WHERE status IN (${ACTIVE.map(() => "?").join(",")}) ORDER BY createdAt, rowid LIMIT 1`,
  );
  let busy = false;

  const tick = async () => {
    if (busy) return;
    const row = next.get(...ACTIVE) as { id: string } | undefined;
    if (!row) return;
    busy = true;
    try {
      await runStages(db, row.id, { dataDir, log: (m) => console.log(`[job ${row.id}] ${m}`) });
    } catch {
      // runStages has already marked the lecture failed with its stage and error.
    } finally {
      busy = false;
    }
  };

  const interrupted = db.prepare(`SELECT id, status FROM lectures WHERE status IN (${STAGES.map(() => "?").join(",")})`).all(...STAGES);
  for (const l of interrupted as { id: string; status: string }[]) console.log(`[job ${l.id}] resuming at ${l.status} after restart`);

  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}
