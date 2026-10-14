import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chapter, Quiz, QuizNotCovered, QuizQuestion } from "@lecture-lens/shared";
import { formatTime, getJSON } from "../lib/api";
import { playerBus, usePlayerTime } from "../lib/playerBus";
import { Icon } from "./Brand";
import { Markdown } from "./Markdown";

const COUNTS = [3, 5, 10] as const;

async function createQuiz(lectureId: string, topic: string, count: number): Promise<Quiz | QuizNotCovered> {
  const res = await fetch(`/api/lectures/${lectureId}/quizzes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic, count }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

type Phase = { kind: "setup" } | { kind: "playing"; quiz: Quiz } | { kind: "results"; quiz: Quiz; answers: number[] };

export function QuizTab({ lectureId, chapters }: { lectureId: string; chapters: Chapter[] }) {
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [topic, setTopic] = useState("");

  if (phase.kind === "playing") {
    return <Play quiz={phase.quiz} onQuit={() => setPhase({ kind: "setup" })} onFinish={(answers) => setPhase({ kind: "results", quiz: phase.quiz, answers })} />;
  }
  if (phase.kind === "results") {
    return (
      <Results
        quiz={phase.quiz}
        answers={phase.answers}
        onRetry={() => setPhase({ kind: "playing", quiz: phase.quiz })}
        onNew={() => {
          setTopic(phase.quiz.topic);
          setPhase({ kind: "setup" });
        }}
      />
    );
  }
  return <Setup lectureId={lectureId} chapters={chapters} topic={topic} setTopic={setTopic} onStart={(quiz) => setPhase({ kind: "playing", quiz })} />;
}

function Setup({
  lectureId,
  chapters,
  topic,
  setTopic,
  onStart,
}: {
  lectureId: string;
  chapters: Chapter[];
  topic: string;
  setTopic: (t: string) => void;
  onStart: (quiz: Quiz) => void;
}) {
  const queryClient = useQueryClient();
  const time = usePlayerTime();
  const [count, setCount] = useState<number>(5);
  const [notCovered, setNotCovered] = useState<string | null>(null);
  const { data: recent = [] } = useQuery({
    queryKey: ["quizzes", lectureId],
    queryFn: () => getJSON<Quiz[]>(`/api/lectures/${lectureId}/quizzes`),
  });
  const create = useMutation({
    mutationFn: ({ t, n }: { t: string; n: number }) => createQuiz(lectureId, t, n),
    onSuccess: (result) => {
      if ("notCovered" in result) return setNotCovered(result.notCovered);
      void queryClient.invalidateQueries({ queryKey: ["quizzes", lectureId] });
      onStart(result);
    },
  });

  const current = chapters.find((c) => time >= c.startSec && time < c.endSec);
  const suggestions = [
    "Everything in this lecture",
    ...(time > 30 && current ? [`What I just watched (${formatTime(current.startSec)}–${formatTime(time)})`] : []),
    ...chapters.slice(1, 5).map((c) => c.title),
  ];

  const start = (t: string) => {
    const clean = t.trim();
    if (!clean || create.isPending) return;
    setTopic(clean);
    setNotCovered(null);
    create.mutate({ t: clean, n: count });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    start(topic);
  };

  if (create.isPending) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        <p className="mt-4 font-medium">Writing {count} questions on “{topic}”</p>
        <p className="mt-1 text-sm text-muted">From the board and what was said. About 15–20 seconds.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="font-semibold tracking-tight">Quiz yourself</h3>
      <p className="mt-1 text-sm text-muted">One question at a time. Wrong answers tell you what you likely mixed up, and where to rewatch.</p>

      <form onSubmit={onSubmit} className="mt-4">
        <label htmlFor="quiz-topic" className="text-xs font-medium text-muted">
          What should it be about?
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="quiz-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. the column picture, or the 3×3 example"
            className="field min-w-0 flex-1"
          />
          <button type="submit" disabled={!topic.trim()} className="btn btn-primary">
            Start
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => start(s)}
              className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-muted transition-colors hover:border-faint hover:bg-hover hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          Questions
          <div role="radiogroup" aria-label="Number of questions" className="inline-flex rounded-md bg-press p-0.5">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                onClick={() => setCount(n)}
                className={`rounded px-2.5 py-0.5 font-medium tabular-nums transition-colors ${count === n ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </form>

      {notCovered && (
        <div role="status" className="callout mt-5 text-sm">
          <p className="font-medium">This lecture doesn’t cover that.</p>
          <p className="mt-1 text-muted">
            <Markdown inline>{notCovered}</Markdown>
          </p>
        </div>
      )}
      {create.error && <p className="mt-4 text-sm text-bad">{create.error.message}</p>}

      {recent.length > 0 && (
        <section className="mt-8">
          <h4 className="mb-1.5 text-xs font-medium text-muted">Recent quizzes</h4>
          <ul className="-mx-2">
            {recent.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onStart(q)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover"
                >
                  <span className="truncate">{q.topic}</span>
                  <span className="shrink-0 text-xs text-faint">{q.questions.length} questions · Retake</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Play({ quiz, onQuit, onFinish }: { quiz: Quiz; onQuit: () => void; onFinish: (answers: number[]) => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const q = quiz.questions[index]!;
  const chosen = answers[index];
  const last = index === quiz.questions.length - 1;

  const choose = (i: number) => {
    if (chosen !== undefined) return;
    setAnswers((a) => {
      const next = [...a];
      next[index] = i;
      return next;
    });
  };
  const advance = () => (last ? onFinish(answers) : setIndex((i) => i + 1));

  // 1-4 picks an option, Enter moves on: the whole quiz works from the keyboard. Only while the quiz
  // is on screen: the tab stays mounted (hidden) when another tab is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (root.current?.offsetParent === null) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) choose(n - 1);
      else if (e.key === "Enter" && chosen !== undefined) advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={root} className="p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="truncate">{quiz.topic}</span>
        <button type="button" onClick={onQuit} className="btn btn-ghost btn-sm -mr-2">
          Quit
        </button>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-press" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((index + (chosen !== undefined ? 1 : 0)) / quiz.questions.length) * 100}%` }} />
        </div>
        <span className="text-xs font-medium text-muted tabular-nums">
          {index + 1} / {quiz.questions.length}
        </span>
      </div>

      <QuestionCard key={q.id} q={q} chosen={chosen} onChoose={choose} />

      {chosen !== undefined && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={advance} className="btn btn-primary">
            {last ? "See results" : "Next question"} <Icon.arrow className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q, chosen, onChoose }: { q: QuizQuestion; chosen: number | undefined; onChoose: (i: number) => void }) {
  const done = chosen !== undefined;
  const right = chosen === q.answerIdx;

  return (
    <section className="mt-5" aria-live="polite">
      <div className="text-[15px] leading-relaxed font-medium">
        <Markdown inline>{q.question}</Markdown>
      </div>
      <div className="mt-4 space-y-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answerIdx;
          const isChosen = i === chosen;
          const style = !done
            ? "border-line-strong bg-surface hover:border-faint hover:bg-hover"
            : isAnswer
              ? "border-ok bg-ok-soft"
              : isChosen
                ? "border-bad bg-bad-soft"
                : "border-line opacity-55";
          return (
            <button
              key={i}
              type="button"
              disabled={done}
              onClick={() => onChoose(i)}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${style}`}
            >
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong text-[11px] text-faint tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <Markdown inline>{opt}</Markdown>
              </span>
            </button>
          );
        })}
      </div>

      {done && <Feedback q={q} chosen={chosen} right={right} />}
    </section>
  );
}

function Feedback({ q, chosen, right }: { q: QuizQuestion; chosen: number; right: boolean }) {
  return (
    <div className={`mt-4 rounded-lg px-3.5 py-3 text-sm ${right ? "bg-ok-soft" : "bg-warn-soft"}`}>
      {!right && q.misconceptions[chosen] && (
        <p className="mb-1.5 font-medium text-warn">
          <Markdown inline>{q.misconceptions[chosen]}</Markdown>
        </p>
      )}
      <p className="text-ink">
        {right && <span className="font-medium text-ok">Right. </span>}
        <Markdown inline>{q.explanation}</Markdown>
      </p>
      <button type="button" onClick={() => playerBus.seek(q.atSec)} className={`btn btn-sm mt-2.5 ${right ? "btn-ghost -ml-2" : ""}`}>
        <Icon.play className="h-3 w-3" /> {right ? "See it in the lecture" : "Rewatch"} at {formatTime(q.atSec)}
      </button>
    </div>
  );
}

function Results({ quiz, answers, onRetry, onNew }: { quiz: Quiz; answers: number[]; onRetry: () => void; onNew: () => void }) {
  const score = quiz.questions.filter((q, i) => answers[i] === q.answerIdx).length;
  const total = quiz.questions.length;
  const verdict = score === total ? "All correct." : score >= total * 0.7 ? "Solid. Rewatch the ones you missed." : "Worth another look at the parts you missed.";

  return (
    <div className="p-4">
      <p className="text-xs text-muted">{quiz.topic}</p>
      <p className="display mt-2 text-[2rem] tabular-nums">
        {score} <span className="text-faint">/ {total}</span>
      </p>
      <p className="mt-1 text-sm text-muted">{verdict}</p>

      <ol className="mt-5 space-y-2">
        {quiz.questions.map((q, i) => {
          const ok = answers[i] === q.answerIdx;
          return (
            <li key={q.id} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm">
              <span className={`mt-0.5 shrink-0 font-semibold ${ok ? "text-ok" : "text-bad"}`} aria-label={ok ? "Correct" : "Wrong"}>
                {ok ? "✓" : "✗"}
              </span>
              <div className="min-w-0 flex-1">
                <Markdown inline>{q.question}</Markdown>
                {!ok && (
                  <p className="mt-1 text-muted">
                    Answer: <Markdown inline>{q.options[q.answerIdx]!}</Markdown>
                  </p>
                )}
              </div>
              <button type="button" onClick={() => playerBus.seek(q.atSec)} className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs text-accent hover:bg-accent-soft">
                {formatTime(q.atSec)}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="btn">
          Retake these questions
        </button>
        <button type="button" onClick={onNew} className="btn btn-primary">
          New quiz
        </button>
      </div>
    </div>
  );
}
