import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type DB = Database.Database;

/**
 * Schema changes, in order. SQLite's user_version records how many have run, so each runs
 * exactly once per database, including the one on the deployed volume. Never edit a step
 * that has shipped: add a new one.
 */
const MIGRATIONS: ((db: DB) => void)[] = [
  // 1: initial schema. CREATE IF NOT EXISTS, so databases made before migrations existed adopt it as-is.
  (db) => db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8")),
  // 2: teaching modes (PRD, Teaching approach).
  (db) =>
    db.exec(`
      ALTER TABLE messages ADD COLUMN mode TEXT NOT NULL DEFAULT 'tell';
      ALTER TABLE quiz_questions ADD COLUMN misconceptions TEXT NOT NULL DEFAULT '[]';
    `),
  // 3: Notion-style organisation (lectures grouped by week) and a lecture-level overview for the Summary tab.
  (db) =>
    db.exec(`
      ALTER TABLE lectures ADD COLUMN week INTEGER;
      ALTER TABLE lectures ADD COLUMN summary TEXT;
    `),
];

export function migrate(db: DB) {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v]!(db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "lecture-lens.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export const SCHEMA_VERSION = MIGRATIONS.length;
