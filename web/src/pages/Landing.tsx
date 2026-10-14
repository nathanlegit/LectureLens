import katex from "katex";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Icon, Logo } from "../components/Brand";

/**
 * Public front page. Every example on it is real output from the demo lecture
 * (MIT 18.06 Lecture 1): the screenshot, the frame at 13:13 and its transcript, and the Guide me answer.
 */
export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-ink">
      <Nav />
      <main>
        <Hero />
        <Board />
        <Pipeline />
        <Study />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Tex({ children, display = false }: { children: string; display?: boolean }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(children, { displayMode: display, throwOnError: false }) }} />;
}

function Stamp({ children }: { children: ReactNode }) {
  return <span className="mx-0.5 rounded-[4px] bg-accent-soft px-1 py-px font-mono text-[0.8em] text-accent tabular-nums">{children}</span>;
}

const WRAP = "mx-auto w-full max-w-5xl px-5 sm:px-8";

function Nav() {
  return (
    <header className="border-b border-line">
      <div className={`${WRAP} flex h-14 items-center justify-between`}>
        <Link href="/" aria-label="Lecture Lens home" className="text-[15px]">
          <Logo />
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/library" className="hidden text-muted transition-colors hover:text-ink sm:inline">
            Open library
          </Link>
          <Link href="/library" className="btn btn-primary btn-sm">
            Upload a lecture
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={`${WRAP} pt-16 sm:pt-24`}>
      <h1 className="max-w-[17ch] text-[clamp(2.3rem,5.4vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.032em]">
        Lecture recordings you can ask questions.
      </h1>
      <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
        Upload a recording. Lecture Lens transcribes what was said, reads what was written on the board, and answers your questions with the
        timestamp to rewatch.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/library" className="btn btn-primary btn-lg">
          Upload a lecture
        </Link>
        <a href="#board" className="group inline-flex items-center gap-1.5 text-[15px] text-muted transition-colors hover:text-ink">
          See what it reads <Icon.arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>

      <figure className="mt-16 sm:mt-20">
        <img
          src="/landing/lecture-view.jpg"
          alt="The Lecture Lens lecture view: the video on the left, the overview and timestamped chapters on the right."
          width={2880}
          height={1760}
          className="w-full rounded-lg border border-line shadow-float"
        />
        <figcaption className="mt-3 text-sm text-faint">The lecture view, with MIT 18.06 Lecture 1 processed: video, overview and chapters.</figcaption>
      </figure>
    </section>
  );
}

function Section({ id, title, intro, children }: { id?: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={`${WRAP} scroll-mt-6 pt-24 sm:pt-32`}>
      <div className="grid gap-x-12 gap-y-8 border-t border-line pt-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h2 className="text-[1.65rem] leading-tight font-semibold tracking-[-0.022em]">{title}</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted">{intro}</div>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function Board() {
  return (
    <Section
      id="board"
      title="The transcript says “that”. The board says what “that” is."
      intro={
        <>
          <p>In a maths lecture the content is on the board, and the speech points at it. A tool that only reads the transcript gets the pointing.</p>
          <p>Here is 13:13 in Strang’s first 18.06 lecture: the moment he finishes the column picture.</p>
        </>
      }
    >
      <figure className="overflow-hidden rounded-lg border border-line">
        <img src="/landing/board-13m13s.jpg" alt="Gilbert Strang at the blackboard, with one times column one plus two times column two equals zero, three written on it." width={480} height={360} className="w-full" />
        <dl className="divide-y divide-line text-[15px]">
          <div className="grid gap-1 px-5 py-4 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
            <dt className="text-sm text-faint">Transcript</dt>
            <dd className="leading-relaxed">“What do I get when I take one of this plus two of that? I do get that, of course.”</dd>
          </div>
          <div className="grid gap-1 px-5 py-4 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
            <dt className="text-sm text-faint">Read from the board</dt>
            <dd className="-my-2 overflow-x-auto">
              <Tex display>{String.raw`1\begin{bmatrix}2\\-1\end{bmatrix}+2\begin{bmatrix}-1\\2\end{bmatrix}=\begin{bmatrix}0\\3\end{bmatrix}`}</Tex>
            </dd>
          </div>
        </dl>
      </figure>
    </Section>
  );
}

function Pipeline() {
  const steps = [
    ["Transcribe", "Whisper turns the audio into timed segments."],
    [
      "Pick the frames",
      "One sample a second, compared over a moving median. A lecturer walking past the board drops out of the median; writing that stays survives it. A new frame is kept when the board actually changes.",
    ],
    ["Read the board", "Claude reads each kept frame and writes down the equations, diagrams and code on it, as LaTeX where it can."],
    ["Chapter", "The transcript and the board readings are merged into one timeline and split into titled chapters with summaries."],
  ];
  return (
    <Section
      title="What happens to a recording"
      intro={<p>A 40-minute lecture takes a few minutes. Progress shows per stage, and the lecture opens when it’s done.</p>}
    >
      <ol className="divide-y divide-line border-y border-line">
        {steps.map(([name, body], i) => (
          <li key={name} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <span className="font-medium">
              <span className="mr-3 text-faint tabular-nums">{i + 1}</span>
              {name}
            </span>
            <span className="leading-relaxed text-muted">{body}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Study() {
  return (
    <Section
      title="Three ways to use it"
      intro={
        <>
          <p>
            <span className="font-medium text-ink">Just tell me</span> gives a direct answer. Every claim cites a frame, and each timestamp jumps the
            video there.
          </p>
          <p>
            <span className="font-medium text-ink">Guide me</span> points you at the board instead of answering, one hint at a time.
          </p>
          <p>
            <span className="font-medium text-ink">Quiz</span> writes a few questions per chapter. A wrong answer names the likely mix-up and the moment
            that clears it up.
          </p>
        </>
      }
    >
      <figure className="rounded-lg border border-line">
        <div className="border-b border-line px-5 py-3 text-sm">
          <span className="text-faint">Guide me · </span>Where do the two lines in the 2×2 row picture meet?
        </div>
        <blockquote className="space-y-3 px-5 py-4 text-[15px] leading-relaxed">
          <p>
            Look at the row-picture graph in <Stamp>8:40</Stamp>. Two lines are drawn there, and the intersection point is circled and labeled in a box.
            The system being plotted is written on the same board:
          </p>
          <Tex display>{String.raw`2x - y = 0, \qquad -x + 2y = 3`}</Tex>
          <p>
            Before reading the label, try checking it yourself. Which values of <Tex>x</Tex> and <Tex>y</Tex> do you think satisfy both equations at
            once?
          </p>
        </blockquote>
        <figcaption className="border-t border-line px-5 py-3 text-sm text-faint">A real answer from the demo lecture, shortened.</figcaption>
      </figure>
    </Section>
  );
}

function Closing() {
  return (
    <section className={`${WRAP} py-24 sm:py-32`}>
      <div className="flex flex-col items-start justify-between gap-6 border-t border-line pt-10 sm:flex-row sm:items-center">
        <p className="text-[1.65rem] leading-tight font-semibold tracking-[-0.022em]">Try it on last week’s lecture.</p>
        <Link href="/library" className="btn btn-primary btn-lg">
          Upload a lecture
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className={`${WRAP} flex flex-col gap-2 py-6 text-sm text-faint sm:flex-row sm:justify-between`}>
        <span>Lecture Lens</span>
        <span>
          Demo lecture: Gilbert Strang, 18.06 Linear Algebra,{" "}
          <a href="https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/" className="underline decoration-line-strong underline-offset-2 hover:text-muted">
            MIT OpenCourseWare
          </a>{" "}
          (CC BY-NC-SA).
        </span>
      </div>
    </footer>
  );
}
