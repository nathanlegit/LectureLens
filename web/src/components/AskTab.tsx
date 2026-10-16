import type React from "react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AskEvent, AskMode, Chapter, ChatMessage } from "@lecture-lens/shared";
import { askStream, getJSON } from "../lib/api";
import { Icon } from "./Brand";
import { FrameStrip } from "./FrameStrip";
import { Markdown, Streaming } from "./Markdown";

interface Pending {
  question: string;
  mode: AskMode;
  answer: string;
  cited: string[];
  error: string | null;
}

const MODES: { id: AskMode; label: string; hint: string }[] = [
  { id: "tell", label: "Just tell me", hint: "A direct answer, cited to the board" },
  { id: "guide", label: "Guide me", hint: "Hints that point at the board, so you work it out" },
];
const NEXT_HINT = "Give me the next hint.";
const REVEAL = "Just tell me the answer.";
const MODE_KEY = "lecture-lens-ask-mode";

/** Applies one streamed event to the answer being written. */
function apply(p: Pending | null, e: AskEvent): Pending | null {
  if (!p) return p;
  if (e.type === "text") return { ...p, answer: p.answer + e.text };
  if (e.type === "cite") return { ...p, answer: `${p.answer}[${e.citation.id}]`, cited: [...p.cited, e.citation.id] };
  if (e.type === "error") return { ...p, error: e.message };
  return p;
}

const NEAR_BOTTOM_PX = 80;

function savedMode(): AskMode {
  try {
    return localStorage.getItem(MODE_KEY) === "guide" ? "guide" : "tell";
  } catch {
    return "tell";
  }
}

export function AskTab({ lectureId, chapters }: { lectureId: string; chapters: Chapter[] }) {
  const queryClient = useQueryClient();
  const messagesKey = ["messages", lectureId];
  const { data: messages = [] } = useQuery({
    queryKey: messagesKey,
    queryFn: () => getJSON<ChatMessage[]>(`/api/lectures/${lectureId}/messages`),
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [mode, setModeState] = useState<AskMode>(savedMode);
  const scroller = useRef<HTMLDivElement>(null);
  // Follow the answer only while the reader is at the bottom; scrolling up to reread stays put.
  const atBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  // Streamed events are applied at most once per frame, not once per chunk.
  const queue = useRef<AskEvent[]>([]);
  const frame = useRef(0);
  const streaming = pending !== null && pending.error === null;

  const setMode = (m: AskMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // not remembered; fine
    }
  };

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (atBottom.current) box.scrollTop = box.scrollHeight;
    else if (pending) setNewBelow(true);
  }, [messages.length, pending?.answer, pending]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const nearBottom = () => {
    const box = scroller.current;
    return !box || box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
  };
  // Any scroll that lands near the bottom resumes following...
  const onScroll = () => {
    if (nearBottom()) {
      atBottom.current = true;
      setNewBelow(false);
    }
  };
  // ...but only the reader scrolling up (wheel, touch drag, keys) stops it. Programmatic and smooth
  // scrolls fire scroll events too, and must not be mistaken for the reader leaving.
  const leave = () => (atBottom.current = false);
  const onWheel = (e: React.WheelEvent) => e.deltaY < 0 && leave();
  const onKeyDown = (e: React.KeyboardEvent) => ["PageUp", "ArrowUp", "Home"].includes(e.key) && leave();

  const toBottom = () => {
    atBottom.current = true;
    setNewBelow(false);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  };

  const flush = () => {
    frame.current = 0;
    const events = queue.current;
    queue.current = [];
    if (events.length) setPending((p) => events.reduce(apply, p));
  };

  async function submit(question: string, askMode: AskMode = mode) {
    question = question.trim();
    if (!question || streaming) return;
    setInput("");
    atBottom.current = true;
    setNewBelow(false);
    setPending({ question, mode: askMode, answer: "", cited: [], error: null });
    await askStream(lectureId, question, askMode, (e) => {
      if (e.type === "done") {
        cancelAnimationFrame(frame.current);
        flush();
        void queryClient.invalidateQueries({ queryKey: messagesKey }).then(() => setPending(null));
        return;
      }
      queue.current.push(e);
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    }).catch(() => setPending((p) => p && { ...p, error: "Lost the connection. Try again." }));
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(input);
  };

  const newChat = async () => {
    if (!window.confirm("Start a new chat? This clears the conversation for this lecture.")) return;
    await fetch(`/api/lectures/${lectureId}/messages/clear`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: messagesKey });
  };

  const last = messages.at(-1);
  const offerLadder = !pending && last?.role === "assistant" && last.mode === "guide";
  const suggestions = chapters.slice(1, 4).map((c) => `Explain “${c.title}”`);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} onWheel={onWheel} onTouchMove={leave} onKeyDown={onKeyDown} data-chat-scroll className="scroll-quiet min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {messages.length > 0 && !pending && (
          <div className="-mt-1 -mb-3 flex justify-end">
            <button type="button" onClick={() => void newChat()} className="btn btn-ghost btn-sm -mr-2">
              <Icon.plus className="h-3.5 w-3.5" /> New chat
            </button>
          </div>
        )}
        {messages.length === 0 && !pending && (
          <div className="pt-4">
            <p className="font-medium">Ask this lecture</p>
            <p className="mt-1 text-sm text-muted">Answers cite the moment and the board, and every timestamp jumps the video there.</p>
            <p className="mt-5 mb-1 text-xs font-medium text-faint">Suggested</p>
            <div className="-mx-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-hover"
                >
                  <Icon.text className="h-4 w-4 shrink-0 text-faint" />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <Question key={m.id} text={m.content} mode={m.mode} />
          ) : (
            <Answer key={m.id} lectureId={lectureId} text={m.content} cited={m.citations.map((c) => c.id)} />
          ),
        )}

        {pending && (
          <>
            <div className="anim-rise">
              <Question text={pending.question} mode={pending.mode} />
            </div>
            {pending.answer ? (
              <Streaming.Provider value={streaming}>
                <Answer lectureId={lectureId} text={pending.answer} cited={pending.cited} writing={streaming} />
              </Streaming.Provider>
            ) : (
              !pending.error && (
                <p className="anim-fade flex items-center gap-2.5 text-sm text-muted">
                  <span className="dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                  {pending.mode === "guide" ? "Finding the right hint…" : "Reading the lecture…"}
                </p>
              )
            )}
            {pending.error && (
              <p role="alert" className="anim-rise rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                {pending.error}{" "}
                <button type="button" className="underline" onClick={() => setPending(null)}>
                  Dismiss
                </button>
              </p>
            )}
          </>
        )}

        {offerLadder && (
          <div className="anim-rise flex flex-wrap gap-2" style={{ animationDelay: "120ms" }}>
            <button type="button" onClick={() => void submit(NEXT_HINT, "guide")} className="btn btn-sm">
              Show me more
            </button>
            <button type="button" onClick={() => void submit(REVEAL, "guide")} className="btn btn-ghost btn-sm">
              Just tell me
            </button>
          </div>
        )}
      </div>
      {newBelow && (
        <button type="button" onClick={toBottom} className="btn btn-sm anim-rise absolute bottom-2 left-1/2 -translate-x-1/2 shadow-float">
          ↓ New text
        </button>
      )}
      </div>

      <form onSubmit={onSubmit} className="p-3 pt-0">
        <div className="rounded-xl border border-line-strong bg-surface shadow-soft transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--ll-accent-soft)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            rows={2}
            placeholder={mode === "guide" ? "Ask, or try an answer…" : "Ask about this lecture…"}
            aria-label="Your question"
            className="block max-h-32 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-faint"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div role="radiogroup" aria-label="Answer style" className="flex rounded-md bg-hover p-0.5 text-xs">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  title={m.hint}
                  onClick={() => setMode(m.id)}
                  className={`rounded-[5px] px-2 py-1 font-medium transition ${mode === m.id ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Ask"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary transition disabled:opacity-25"
            >
              <Icon.send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Question({ text, mode }: { text: string; mode: AskMode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {mode === "guide" && <span className="text-[11px] font-medium text-muted">Guide me</span>}
      <p className="max-w-[85%] rounded-2xl bg-hover px-3.5 py-2 text-sm">{text}</p>
    </div>
  );
}

function Answer({ lectureId, text, cited, writing = false }: { lectureId: string; text: string; cited: string[]; writing?: boolean }) {
  return (
    <div className={writing ? "stream-caret" : ""}>
      <Markdown>{text}</Markdown>
      <FrameStrip lectureId={lectureId} ids={cited} />
    </div>
  );
}
