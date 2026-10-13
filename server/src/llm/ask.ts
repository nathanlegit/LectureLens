import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { AskEvent, AskMode, Citation } from "@lecture-lens/shared";
import type { DB } from "../db/db.ts";
import { CiteStream } from "./citeStream.ts";
import { anthropic, logUsage, MODELS } from "./client.ts";
import { loadLectureContext, timelineSystem } from "./lectureContext.ts";

// Both modes live in one fixed block, and each question carries its mode, so switching modes
// mid-conversation leaves the cached prefix (timeline + these instructions + history) intact.
const INSTRUCTIONS = `You help a student with this lecture, using only the timeline. Each student message starts with its mode.

Always:
- After every claim, cite the block(s) it comes from, e.g. [F07] or [F07, F12]. Prefer the block whose SCREEN shows the relevant equation or figure.
- When something written on screen matters (an equation, a matrix, a diagram, code), include it: equations in LaTeX ($...$ inline, $$...$$ display), code in fenced blocks.
- If the timeline does not cover the question, say so plainly and point to the closest thing it does cover. Never fill gaps from general knowledge without saying that is what you are doing.
- If a SCREEN description conflicts with what was SAID, or marks something unreadable, trust the clearer source and do not dwell on transcription problems.

Mode "Just tell me": answer directly. A short direct answer first, then the supporting detail. Be concise.

Mode "Guide me": help the student work it out instead of handing over the answer.
- First reply to a new question: do NOT state the answer, the final result or the key step. Point to the one block where the idea is on the board (cite it), say what to look at, and ask one focused question. 2 to 4 sentences.
- "Give me the next hint": a more specific hint that still does not give the answer, citing a block.
- An attempt that is right: confirm it and add the one-sentence why, with a citation.
- An attempt that is wrong: name the specific mix-up (what they most likely confused with what), show briefly why it fails if that helps, and point to the block that resolves it. Do not state the correct answer: end by asking them to try again with that in mind. If the slip is a simple swap or a sign, saying exactly what was swapped would hand over the answer; name the kind of slip instead ("check which number goes with which column", "look at the sign of that entry again") and point to where to check it. Only after a second wrong attempt on the same question, give the answer with the reason.
- "Just tell me the answer": give the full cited answer, as in "Just tell me".
- A question with nothing to work out (what was said, where something is): just answer it briefly.`;

const MODE_LABEL: Record<AskMode, string> = { tell: "Just tell me", guide: "Guide me" };
const HISTORY_TURNS = 6;

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  rawContent: string | null;
}

export const thumbUrl = (lectureId: string, blockId: string) => `/media/${lectureId}/frames/${blockId}.jpg`;

export interface AskOptions {
  mode?: AskMode;
  /** false: no history read or written (used by the eval). */
  persist?: boolean;
}

/**
 * Answers a question about one lecture, streaming text and checked citations through `emit`.
 * Both turns are saved exactly as sent and received, so later requests replay history unchanged.
 */
export async function ask(
  db: DB,
  lectureId: string,
  question: string,
  emit: (e: AskEvent) => void,
  { mode = "tell", persist = true }: AskOptions = {},
): Promise<{ answer: string; citations: Citation[] }> {
  const ctx = loadLectureContext(db, lectureId);
  const history = persist
    ? (
        db
          .prepare("SELECT role, content, rawContent FROM messages WHERE lectureId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?")
          .all(lectureId, HISTORY_TURNS * 2) as StoredMessage[]
      ).reverse()
    : [];

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({
    role: m.role,
    content:
      m.role === "assistant" && m.rawContent
        ? (JSON.parse(m.rawContent) as Anthropic.Beta.BetaContentBlockParam[])
        : (m.rawContent ?? m.content),
  }));
  const sent = `Mode: ${MODE_LABEL[mode]}\n\n${question}`;
  messages.push({ role: "user", content: sent });

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
    return { answer: "", citations: [] };
  }
  if (cites.dropped.length) console.warn(`ask ${lectureId}: dropped unknown citations ${cites.dropped.join(", ")}`);

  let messageId: string = randomUUID();
  if (persist) {
    const save = db.prepare(
      "INSERT INTO messages (id, lectureId, role, content, rawContent, citations, mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    db.transaction(() => {
      save.run(randomUUID(), lectureId, "user", question, sent, "[]", mode);
      save.run(messageId, lectureId, "assistant", answer, JSON.stringify(final.content), JSON.stringify(citations), mode);
    })();
  } else {
    messageId = "";
  }
  emit({ type: "done", messageId });
  return { answer, citations };
}
