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
  // 4: weeks that exist (even empty) with editable titles; quizzes on any topic, not one per chapter.
  // quiz_questions (per chapter) is superseded by quiz_items and left unused.
  (db) =>
    db.exec(`
      CREATE TABLE weeks (
        moduleId  TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        week      INTEGER NOT NULL,
        title     TEXT,
        PRIMARY KEY (moduleId, week)
      );
      INSERT OR IGNORE INTO weeks (moduleId, week) SELECT DISTINCT moduleId, week FROM lectures WHERE week IS NOT NULL;
      CREATE TABLE quizzes (
        id         TEXT PRIMARY KEY,
        lectureId  TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
        topic      TEXT NOT NULL,
        createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE quiz_items (
        id              TEXT PRIMARY KEY,
        quizId          TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        idx             INTEGER NOT NULL,
        question        TEXT NOT NULL,
        options         TEXT NOT NULL,
        answerIdx       INTEGER NOT NULL,
        explanation     TEXT NOT NULL,
        misconceptions  TEXT NOT NULL,
        blockId         TEXT NOT NULL,
        atSec           REAL NOT NULL
      );
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
