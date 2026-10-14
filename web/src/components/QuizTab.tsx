import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chapter, QuizQuestion } from "@lecture-lens/shared";
import { formatTime, getJSON, postJSON } from "../lib/api";
import { playerBus, usePlayerTime } from "../lib/playerBus";
import { Icon } from "./Brand";
import { Markdown } from "./Markdown";

export function QuizTab({ chapters }: { chapters: Chapter[] }) {
  const time = usePlayerTime();
  // Start on the chapter being watched: "quiz me on what I just saw".
  const [chapterId, setChapterId] = useState(
    () => (chapters.find((c) => time >= c.startSec && time < c.endSec) ?? chapters[0])?.id ?? "",
  );
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) return <p className="p-4 text-sm text-muted">No chapters yet.</p>;

  return (
    <div className="p-4">
      <label className="block text-xs font-medium text-muted" htmlFor="quiz-chapter">
        Chapter
      </label>
      <select
        id="quiz-chapter"
        value={chapterId}
        onChange={(e) => setChapterId(e.target.value)}
        className="field mt-1.5 w-full"
      >
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {formatTime(c.startSec)} · {c.title}
          </option>
        ))}
      </select>
      <ChapterQuiz key={chapter.id} chapter={chapter} />
    </div>
  );
}

function ChapterQuiz({ chapter }: { chapter: Chapter }) {
  const queryClient = useQueryClient();
  const key = ["quiz", chapter.id];
  const { data: questions, isPending } = useQuery({
    queryKey: key,
    queryFn: () => getJSON<QuizQuestion[]>(`/api/chapters/${chapter.id}/quiz`),
  });
  const generate = useMutation({
    mutationFn: (regenerate: boolean) => postJSON<QuizQuestion[]>(`/api/chapters/${chapter.id}/quiz${regenerate ? "?regenerate=1" : ""}`),
    onSuccess: (qs) => {
      queryClient.setQueryData(key, qs);
      setChosen({});
    },
  });
  const [chosen, setChosen] = useState<Record<string, number>>({});

  if (isPending) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  if (generate.isPending) {
    return (
      <p className="mt-6 animate-pulse text-sm text-muted">
        Writing questions from the board and the explanation… (about 15 seconds)
      </p>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
        <Icon.check className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-3 font-medium">Check you got it</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          A few questions on this chapter. Wrong answers tell you what you likely mixed up, and where to rewatch.
        </p>
        <button
          type="button"
          onClick={() => generate.mutate(false)}
          className="btn btn-primary mt-5"
        >
          Quiz me on this chapter
        </button>
        {generate.error && <p className="mt-3 text-sm text-bad">{generate.error.message}</p>}
      </div>
    );
  }

  const answered = questions.filter((q) => chosen[q.id] !== undefined);
  const correct = answered.filter((q) => chosen[q.id] === q.answerIdx).length;

  return (
    <div className="mt-5 space-y-6">
      {questions.map((q, i) => (
        <QuestionCard key={q.id} n={i + 1} q={q} chosen={chosen[q.id]} onChoose={(idx) => setChosen((c) => ({ ...c, [q.id]: idx }))} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="font-medium">
          {answered.length === questions.length ? `${correct} of ${questions.length} correct` : `${answered.length} of ${questions.length} answered`}
        </span>
        <span className="flex gap-2">
          {answered.length > 0 && (
            <button type="button" onClick={() => setChosen({})} className="btn btn-ghost btn-sm">
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={() => generate.mutate(true)}
            className="btn btn-sm"
          >
            New questions
          </button>
        </span>
      </div>
      {generate.error && <p className="text-sm text-bad">{generate.error.message}</p>}
    </div>
  );
}

function QuestionCard({ n, q, chosen, onChoose }: { n: number; q: QuizQuestion; chosen: number | undefined; onChoose: (i: number) => void }) {
  const done = chosen !== undefined;
  const right = chosen === q.answerIdx;

  return (
    <section>
      <div className="flex gap-2 text-[15px] font-medium">
        <span className="text-faint tabular-nums">{n}.</span>
        <Markdown inline className="leading-relaxed">
          {q.question}
        </Markdown>
      </div>
      <div className="mt-3 space-y-2">
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
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${style}`}
            >
              <Markdown inline>{opt}</Markdown>
            </button>
          );
        })}
      </div>

      {done && (
        <div className={`mt-3 rounded-lg px-3.5 py-3 text-sm ${right ? "bg-ok-soft" : "bg-warn-soft"}`}>
          {!right && q.misconceptions[chosen] && (
            <p className="mb-1.5 font-medium text-warn">
              <Markdown inline>{q.misconceptions[chosen]}</Markdown>
            </p>
          )}
          <p className="text-ink">
            {right && <span className="font-medium text-ok">Right. </span>}
            <Markdown inline>{q.explanation}</Markdown>
          </p>
          <button
            type="button"
            onClick={() => playerBus.seek(q.atSec)}
            className={`btn btn-sm mt-2.5 ${right ? "btn-ghost -ml-2" : "btn-primary"}`}
          >
            ▶ {right ? "See it in the lecture" : "Rewatch"} at {formatTime(q.atSec)}
          </button>
        </div>
      )}
    </section>
  );
}
