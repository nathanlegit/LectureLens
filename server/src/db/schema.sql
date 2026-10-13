-- Media lives on disk under DATA_DIR/<lectureId>/; these tables hold paths and structured records.

CREATE TABLE IF NOT EXISTS modules (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  glossary   TEXT,
  createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lectures (
  id           TEXT PRIMARY KEY,
  moduleId     TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  videoPath    TEXT,
  durationSec  REAL,
  status       TEXT NOT NULL DEFAULT 'queued',
  failedStage  TEXT,
  error        TEXT,
  stageDone    INTEGER NOT NULL DEFAULT 0,
  stageTotal   INTEGER NOT NULL DEFAULT 0,
  isSeed       INTEGER NOT NULL DEFAULT 0,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id         INTEGER PRIMARY KEY,
  lectureId  TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  startSec   REAL NOT NULL,
  endSec     REAL NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_lecture ON transcript_segments(lectureId, startSec);

-- id is the lecture-local block ID ("F07"); description NULL means stage 4 has not done it yet.
CREATE TABLE IF NOT EXISTS frames (
  lectureId    TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  atSec        REAL NOT NULL,
  kind         TEXT NOT NULL,
  hash         TEXT,
  imagePath    TEXT NOT NULL,
  description  TEXT,
  PRIMARY KEY (lectureId, id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id            TEXT PRIMARY KEY,
  lectureId     TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  title         TEXT NOT NULL,
  startBlockId  TEXT NOT NULL,
  startSec      REAL NOT NULL,
  endSec        REAL NOT NULL,
  summary       TEXT NOT NULL
);

-- rawContent keeps the assistant's content blocks so history replays unchanged.
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  lectureId   TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  rawContent  TEXT,
  citations   TEXT NOT NULL DEFAULT '[]',
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id           TEXT PRIMARY KEY,
  chapterId    TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  options      TEXT NOT NULL,
  answerIdx    INTEGER NOT NULL,
  explanation  TEXT NOT NULL,
  blockId      TEXT NOT NULL,
  atSec        REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id             INTEGER PRIMARY KEY,
  at             TEXT NOT NULL DEFAULT (datetime('now')),
  route          TEXT NOT NULL,
  model          TEXT NOT NULL,
  inputTok       INTEGER NOT NULL,
  cacheReadTok   INTEGER NOT NULL,
  cacheWriteTok  INTEGER NOT NULL,
  outputTok      INTEGER NOT NULL
);
