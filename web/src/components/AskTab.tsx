import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chapter, ChatMessage } from "@lecture-lens/shared";
import { askStream, getJSON } from "../lib/api";
import { FrameStrip } from "./FrameStrip";
import { Markdown } from "./Markdown";

interface Pending {
  question: string;
  answer: string;
  cited: string[];
  error: string | null;
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
  const bottom = useRef<HTMLDivElement>(null);
  const streaming = pending !== null && pending.error === null;

  // Braces matter: scrollIntoView returns a Promise in current browsers, and an effect must not return one.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending?.answer]);

  async function submit(question: string) {
    question = question.trim();
    if (!question || streaming) return;
    setInput("");
    setPending({ question, answer: "", cited: [], error: null });
    await askStream(lectureId, question, (e) => {
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

  const suggestions = chapters.slice(1, 4).map((c) => `Explain “${c.title}”`);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {messages.length === 0 && !pending && (
          <div className="py-6 text-center">
            <p className="text-sm text-stone-500">
              Ask anything about this lecture. Answers cite the moment and the board, and every chip jumps the video there.
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-stone-700 dark:text-stone-300 dark:hover:text-indigo-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <Question key={m.id} text={m.content} />
          ) : (
            <Answer key={m.id} lectureId={lectureId} text={m.content} cited={m.citations.map((c) => c.id)} />
          ),
        )}

        {pending && (
          <>
            <Question text={pending.question} />
            {pending.answer ? (
              <Answer lectureId={lectureId} text={pending.answer} cited={pending.cited} />
            ) : (
              !pending.error && <p className="animate-pulse text-sm text-stone-500">Reading the lecture…</p>
            )}
            {pending.error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {pending.error}{" "}
                <button type="button" className="underline" onClick={() => setPending(null)}>
                  Dismiss
                </button>
              </p>
            )}
          </>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-stone-200 p-3 dark:border-stone-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(input);
            }
          }}
          rows={1}
          placeholder="Ask about this lecture…"
          aria-label="Your question"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

function Question({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-stone-200 px-3.5 py-2 text-sm dark:bg-stone-800">{text}</p>
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
