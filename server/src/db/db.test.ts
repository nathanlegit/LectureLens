import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate, SCHEMA_VERSION } from "./db.ts";

const columns = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("migrate", () => {
  it("builds a fresh database at the latest version", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(db.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    expect(columns(db, "messages")).toContain("mode");
    expect(columns(db, "quiz_questions")).toContain("misconceptions");
  });

  it("upgrades a database created before migrations existed, keeping its rows", () => {
    const db = new Database(":memory:");
    // The pre-migration world: the original schema file applied directly, user_version still 0.
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`INSERT INTO modules (id, name) VALUES ('m', 'M');
             INSERT INTO lectures (id, moduleId, title) VALUES ('l', 'm', 'L');
             INSERT INTO messages (id, lectureId, role, content) VALUES ('q', 'l', 'user', 'hi');`);

    migrate(db);
    expect(db.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.prepare("SELECT content, mode FROM messages").get()).toEqual({ content: "hi", mode: "tell" });
    expect(db.prepare("SELECT title, week, summary FROM lectures").get()).toEqual({ title: "L", week: null, summary: null });
  });

  it("is a no-op when already current", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
  });
});
