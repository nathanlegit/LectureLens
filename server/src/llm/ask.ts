import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { AskEvent, Citation } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { CiteStream } from "./citeStream.ts";
import { anthropic, logUsage, MODELS } from "./client.ts";
import { loadLectureContext, timelineSystem } from "./lectureContext.ts";

const INSTRUCTIONS = `You answer a student's questions about this lecture, using only the timeline.
- After every claim, cite the block(s) it comes from, e.g. [F07] or [F07, F12]. Prefer the block whose SCREEN shows the relevant equation or figure.
- When the answer depends on something written on screen (an equation, a matrix, a diagram, code), include it: equations in LaTeX ($...$ inline, $$...$$ display), code in fenced blocks.
- If the timeline does not cover the question, say so plainly and suggest the closest thing it does cover. Never fill gaps from general knowledge without saying that is what you are doing.
- Be concise: a short direct answer first, then the supporting detail.`;

const HISTORY_TURNS = 6;

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  rawContent: string | null;
}

export const thumbUrl = (lectureId: string, blockId: string) => `/media/${lectureId}/frames/${blockId}.jpg`;

/**
 * Answers a question about one lecture, streaming text and checked citations through `emit`.
 * Saves both turns; the assistant turn keeps its raw content blocks so later requests replay
 * history unchanged.
 */
export async function ask(db: DB, lectureId: string, question: string, emit: (e: AskEvent) => void): Promise<void> {
  const ctx = loadLectureContext(db, lectureId);
  const history = (
    db
      .prepare("SELECT role, content, rawContent FROM messages WHERE lectureId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?")
      .all(lectureId, HISTORY_TURNS * 2) as StoredMessage[]
  ).reverse();

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.role === "assistant" && m.rawContent ? (JSON.parse(m.rawContent) as Anthropic.Beta.BetaContentBlockParam[]) : m.content,
  }));
  messages.push({ role: "user", content: question });

  const cites = new CiteStream(new Set(ctx.byId.keys()));
  const citations: Citation[] = [];
  let answer = "";
  const forward = (events: ReturnType<CiteStream["push"]>) => {
    for (const e of events) {
      if (e.type === "text") {
        answer += e.text;
        emit(e);
      } else {
        const citation = { id: e.id, sec: ctx.byId.get(e.id)!.startSec, thumbUrl: thumbUrl(lectureId, e.id) };
        answer += `[${e.id}]`;
        citations.push(citation);
        emit({ type: "cite", citation });
      }
    }
  };

  const stream = anthropic.beta.messages.stream({
    model: MODELS.reasoning,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: timelineSystem(ctx, INSTRUCTIONS),
    messages,
    cache_control: { type: "ephemeral" },
    output_config: { effort: "low" },
  });
  stream.on("text", (delta) => forward(cites.push(delta)));
  const final = await stream.finalMessage();
  forward(cites.end());
  logUsage(db, "ask", MODELS.reasoning, final.usage);

  if (final.stop_reason === "refusal") {
    emit({ type: "error", message: "This question could not be answered." });
    return;
  }
  if (cites.dropped.length) console.warn(`ask ${lectureId}: dropped unknown citations ${cites.dropped.join(", ")}`);

  const save = db.prepare(
    "INSERT INTO messages (id, lectureId, role, content, rawContent, citations) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const messageId = randomUUID();
  db.transaction(() => {
    save.run(randomUUID(), lectureId, "user", question, null, "[]");
    save.run(messageId, lectureId, "assistant", answer, JSON.stringify(final.content), JSON.stringify(citations));
  })();
  emit({ type: "done", messageId });
}
