import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AskMode, Chapter, ChatMessage } from "@lecture-lens/shared";
import { askStream, getJSON } from "../lib/api";
import { Icon } from "./Brand";
import { FrameStrip } from "./FrameStrip";
import { Markdown } from "./Markdown";

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
  const bottom = useRef<HTMLDivElement>(null);
  const streaming = pending !== null && pending.error === null;

  const setMode = (m: AskMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // not remembered; fine
    }
  };

  // Braces matter: scrollIntoView returns a Promise in current browsers, and an effect must not return one.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending?.answer]);

  async function submit(question: string, askMode: AskMode = mode) {
    question = question.trim();
    if (!question || streaming) return;
    setInput("");
    setPending({ question, mode: askMode, answer: "", cited: [], error: null });
    await askStream(lectureId, question, askMode, (e) => {
      setPending((p) => {
        if (!p) return p;
        if (e.type === "text") return { ...p, answer: p.answer + e.text };
        if (e.type === "cite") return { ...p, answer: `${p.answer}[${e.citation.id}]`, cited: [...p.cited, e.citation.id] };
        if (e.type === "error") return { ...p, error: e.message };
        return p;
      });
      if (e.type === "done") {
        void queryClient.invalidateQueries({ queryKey: messagesKey }).then(() => setPending(null));
      }
    }).catch(() => setPending((p) => p && { ...p, error: "Lost the connection. Try again." }));
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(input);
  };

  const last = messages.at(-1);
  const offerLadder = !pending && last?.role === "assistant" && last.mode === "guide";
  const suggestions = chapters.slice(1, 4).map((c) => `Explain “${c.title}”`);

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-quiet flex-1 space-y-6 overflow-y-auto p-4">
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
            <Question text={pending.question} mode={pending.mode} />
            {pending.answer ? (
              <Answer lectureId={lectureId} text={pending.answer} cited={pending.cited} />
            ) : (
              !pending.error && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  {pending.mode === "guide" ? "Finding the right hint…" : "Reading the lecture…"}
                </p>
              )
            )}
            {pending.error && (
              <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                {pending.error}{" "}
                <button type="button" className="underline" onClick={() => setPending(null)}>
                  Dismiss
                </button>
              </p>
            )}
          </>
        )}

        {offerLadder && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void submit(NEXT_HINT, "guide")} className="btn btn-sm">
              Show me more
            </button>
            <button type="button" onClick={() => void submit(REVEAL, "guide")} className="btn btn-ghost btn-sm">
              Just tell me
            </button>
          </div>
        )}
        <div ref={bottom} />
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

function Answer({ lectureId, text, cited }: { lectureId: string; text: string; cited: string[] }) {
  return (
    <div>
      <Markdown>{text}</Markdown>
      <FrameStrip lectureId={lectureId} ids={cited} />
    </div>
  );
}
