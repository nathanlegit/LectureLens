// Milestone 2 CLI: ask a question about a processed lecture and see the cited answer.
//   npm run ask -- <lectureId> "question"     (--fresh clears the conversation first, --guide uses Guide me)
import { parseArgs } from "node:util";
import { config } from "../config.ts";
import { openDb } from "../db/db.ts";
import { ask } from "../llm/ask.ts";
import { formatTime } from "../pipeline/timeline.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { fresh: { type: "boolean", default: false }, guide: { type: "boolean", default: false } } });
const [lectureId, question] = positionals;
if (!lectureId || !question) {
  console.error('usage: npm run ask -- <lectureId> "question" [--fresh]');
  process.exit(1);
}
const db = openDb(config.DATA_DIR);
if (values.fresh) db.prepare("DELETE FROM messages WHERE lectureId = ?").run(lectureId);

const cited: string[] = [];
await ask(db, lectureId, question, (e) => {
  if (e.type === "text") process.stdout.write(e.text);
  else if (e.type === "cite") {
    process.stdout.write(`\x1b[36m[${e.citation.id} ${formatTime(e.citation.sec)}]\x1b[0m`);
    cited.push(e.citation.id);
  } else if (e.type === "error") console.error(`\n${e.message}`);
}, { mode: values.guide ? "guide" : "tell" });

const usage = db.prepare("SELECT inputTok, cacheReadTok, cacheWriteTok, outputTok FROM usage_log WHERE route = 'ask' ORDER BY id DESC LIMIT 1").get();
console.log(`\n\ncited: ${[...new Set(cited)].join(", ") || "none"}\nusage: ${JSON.stringify(usage)}`);
