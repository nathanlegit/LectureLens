# Lecture Lens PRD

Oct 12, 2026 (updated Oct 13: teaching modes) · @Nathan

## Problem and pitch

Lecture Lens (working name) answers questions about a module's lecture recordings using what was shown on screen as well as what was said, with the slide and a clickable timestamp as the citation.

Existing tools read the transcript only. NotebookLM ingests public YouTube links and answers with transcript citations. Panopto Access AI generates summaries and chapters from automatic captions. Neither sees the equation on the slide, the diagram on the whiteboard, or the code on screen, which is often where the content of a STEM lecture actually lives. They also summarise rather than teach: some lecturers switch Panopto summaries off for that reason.

**One-line pitch:** NotebookLM reads the transcript and hands you the answer; Lecture Lens watches the board and teaches you to get there.

**Why this, and not just a chat window.** Claude chat cannot take an hour of video or audio, and a chat transcript cannot sync citations to a video player. Those two facts are the reason this is an app and not a prompt.

**Where the edge holds, and where it does not.** If the lecturer uploads slides to Moodle as a PDF, a student can give NotebookLM the PDF plus the transcript, and most of the visual advantage disappears. The edge is real for whiteboard and handwritten derivations, live coding, demos, and lecturers who never upload slides. Target those modules in the demo and the pitch. Video-capable models (Gemini takes video directly) mean the capability is not a moat; the product is the student workflow around it: cited answers, player jumps, quiz and rewatch.

**Category risk.** Lecture summarisers are among the most common student hackathon ideas, so judges will see the category before the differentiator. The demo must show the difference within the first 30 seconds.

Hackathon fit: Better Student Life track. It makes catching up on recorded lectures faster without replacing the learning.

Sources: [NotebookLM YouTube support (Neowin)](https://www.neowin.net/news/googles-notebooklm-adds-support-for-youtube-videos/), [Panopto Access AI (Northwestern)](https://services.northwestern.edu/TDClient/30/Portal/KB/Article/2960/Panopto-Access-AI-AI-Chapters-and-AI-Summaries), [lecturers hiding AI summaries (Teesside)](https://eatsupport.tees.ac.uk/staff/knowledgebase/review-ai-summaries-chapters-and-captions-ai-assist/).

## Users and stories

The primary user is a university student catching up on, or revising from, recorded lectures in a slide- or board-heavy module (maths, stats, CS, economics). The demo user is Nathan with one real UCL module.

1. As a student, I upload a lecture recording and get a chaptered outline with timestamps, so I can see what the lecture covered in two minutes.
2. As a student, I ask a plain-English question and get an answer that cites the exact frame and timestamp, so I can verify it and jump to that moment.
3. As a student, when the answer depends on something only written on screen (an equation, a diagram), the answer includes it, so I am not left with "and this term goes to zero".
4. As a student, I generate a short quiz on one chapter, so I know whether I understood it rather than just read a summary. When I get one wrong, it tells me the likely mix-up and the moment in the lecture that clears it up.
5. As a student, I keep all recordings for one module together, so I return to the same place each week.
6. As a student revising, I switch Ask to "Guide me" and get a hint pointing at the board instead of the answer, so I work it out myself and remember it.

## Scope

The MVP is one lecture done really well: upload, process, outline, cited Q&A with frames, and a chapter quiz. Everything else waits until that loop is demo-ready.

**MVP (must ship)**

- MP4 upload, up to about 90 minutes
- Processing pipeline with visible progress per stage
- Chaptered outline with timestamps
- Q&A over one lecture, citing frames and timestamps, with clickable jumps in the player
- Two teaching modes in Ask: "Just tell me" (direct cited answer) and "Guide me" (hint ladder), see Teaching approach
- Quiz of 3 to 5 questions per chapter, built for retrieval practice: wrong answers get a misconception note and a rewatch timestamp
- Modules as simple folders of lectures

**Stretch (only after MVP is demo-ready, in this order)**

1. Two more teaching modes: "Quiz me" and "I'm lost" (see Teaching approach)
2. Q&A across all lectures in a module (needs retrieval, see Cost)
3. "Give me a similar problem": a faded worked example built from a board example
4. Spaced repetition: missed quiz questions come back in later sessions
5. YouTube URL ingest, best-effort
6. Export a lecture's outline to Notion

**Out of scope**

- A note-taking app or editor
- Mac or browser extension
- Panopto SSO integration or scraping UCL systems
- User accounts, multi-user, sharing
- Mobile layout beyond not breaking
- Fine-tuning a model (see Teaching approach for why prompting and app structure do this job)
- Teacher personas that imitate real people ("teach like Feynman", "like my lecturer")

## Ingestion pipeline

Each lecture runs once through six sequential stages; each stage writes its output to disk so a failed stage can be rerun without redoing the ones before it.

1. **Ingest.** Input: MP4 file. Output: stored video plus extracted audio (16 kHz mono WAV via ffmpeg). ffprobe checks the codec first; anything not H.264 is re-encoded so the browser can play and seek it.
2. **Transcribe.** Input: WAV. Output: transcript segments with start and end timestamps, via whisper.cpp locally or a hosted Whisper API on the deployed server (one interface, two implementations; see Tech stack). Claude cannot take audio, so this stage is required. Voice-activity detection is on, since Whisper invents text over silence, and the initial prompt carries the module's vocabulary (names, notation, jargon).
3. **Capture frames.** Input: video. Output: 30 to 60 JPEGs at moments where the screen changes noticeably (ffmpeg scene-change detection, threshold tuned on a real lecture), plus a forced frame every 60 s as a floor. Slides and whiteboards need different handling:
   - Every candidate is compared with the last kept frame by perceptual hash, and near-duplicates are dropped. This stops the 60 s floor from paying to describe the same slide five times.
   - On a big change, keep the frame about 1 s *before* it as well as the one after. On a whiteboard, the complete board just before it is erased or the camera cuts away is the frame worth having.
   - Whiteboard writing builds up gradually and may never cross the scene threshold; the hash comparison against the last kept frame catches accumulated change that a frame-to-frame threshold misses.
   - The lecturer walking in front of the board, camera pans and animated slide builds cause false triggers. Tune against these on the demo lecture in Milestone 1.
4. **Describe frames.** Input: each frame, plus the transcript from about 30 s either side and the previous frame's description. Output: a text description per frame, transcribing any equation (as LaTeX), diagram, code or slide text verbatim. The transcript context helps read handwriting; the previous description lets the model write "as F11, plus this new line" on a whiteboard, which cuts output tokens. Model: Sonnet 5.5. Haiku 5.5 was tried first and, on a filmed board, stated wrong numbers with confidence (a dropped minus sign on a clear close-up, a value hidden behind the lecturer's arm filled in by guesswork); Sonnet marks what it cannot read as unreadable instead. `FRAMES_MODEL` switches back to Haiku for cost. Calls run in parallel up to a concurrency cap, with retry and backoff on rate limits; a frame with no description is still to do, so the stage resumes where it stopped.
5. **Merge timeline.** Input: transcript segments and frame descriptions. Output: one ordered timeline of blocks, one per frame, each with a stable ID, the time range that frame was on screen, its description, and the transcript spoken during that range. Plain code, no model call. Example:

   ```
   [F07 · 12:30–14:10]
   SCREEN: Bayes' rule, $P(A|B) = \frac{P(B|A)P(A)}{P(B)}$, tree diagram with ...
   SAID: so if we flip this around, the thing we actually want is ...
   ```
6. **Chapter.** Input: the merged timeline. Output: 5 to 12 chapters, each with a title, start time, short summary and the frame IDs it covers. Model: Sonnet 5.5, structured JSON output.

The interesting design problems are stage 3 (when has the screen changed enough, and which moment is worth keeping?) and stage 5 (how to align two timestamped streams into something Claude reasons over and cites well). Everything else is plumbing.

## Interface

Three screens, one of which (the lecture view) carries the whole demo.

**Module list.** Modules as cards; create a module by name; upload a recording into one. Uploading shows a progress row with the current pipeline stage, since processing an hour takes minutes, not seconds.

**Lecture view.** Video player on the left, a tabbed panel on the right with Outline, Ask and Quiz.

- *Outline:* chapters with timestamps; clicking one seeks the player.
- *Ask:* a chat box with a mode switch ("Just tell me" / "Guide me") above the input. Each answer shows inline citations as `[12:34]` chips that seek the player, and a thumbnail strip of the cited frames that enlarge on click. Answers stream. In "Guide me", each reply ends with a "Show me more" button for the next hint and a "Just tell me" button to reveal the answer.
- *Quiz:* pick a chapter, get 3 to 5 questions. A wrong answer shows the misconception behind that option, the explanation, and a timestamp to rewatch.

**Empty and error states.** A stage that fails shows which stage and a retry button that reruns from that stage.

Citation rule for the Ask tab: every claim in an answer must point to a timeline entry. If the timeline does not cover the question, the answer says so rather than guessing. This is also the line to use in the pitch.

How citations work:

- The model cites block IDs (`[F07]`), never timestamps. Models copy exact times badly; the server turns an ID into its timestamp and thumbnail.
- Answers stream, so citations are checked as they arrive, not after. The server reads citation tokens out of the stream and only emits a chip for an ID that exists in this lecture's timeline. An unknown ID is dropped and logged. zod still checks every non-streamed JSON output (chapters, quiz).

Quiz rules: the server shuffles answer options before saving, since models favour certain positions, and zod checks that `answerIdx` points to a real option.

## Teaching approach

The product should teach, not just answer. That is what separates it from a transcript summariser, and it answers the reason some lecturers switch AI summaries off: a tool that will not just hand over the answer is one a lecturer would recommend.

**Principle: every teaching move is grounded in the lecture.** A generic AI tutor can say "think about linear combinations". Lecture Lens can say "look at the arrows he draws at 12:41: which combination of them reaches $b$?", with the frame and a chip that seeks the video. Hints, explanations and quiz feedback all cite timeline blocks under the same citation rule as Ask.

**Teaching modes, not personas.** The student chooses *how* they are taught, not a character. Each mode is a different system-prompt section and UI behaviour over the same cached timeline.

| Mode | What it does | Technique | Ships in |
| --- | --- | --- | --- |
| Just tell me | Direct answer with citations (current behaviour) | Worked example | MVP |
| Guide me | Hint ladder: a nudge pointing at the relevant board, then a stronger hint, then the full answer. Reveals the answer only when the student asks or has tried | Socratic questioning, desirable difficulty | MVP |
| Quiz me | Turns any answer into 1 to 3 retrieval questions on the spot | Retrieval practice | Stretch |
| I'm lost | Starts from the prerequisite the lecture assumed, slower steps, more worked examples | Scaffolding | Stretch |

An optional tone setting (encouraging or concise) covers most of what people want from personas, without the gimmick and without trading away accuracy.

**Guide me: the hint ladder.**

1. The first reply never states the answer. It names what to look at (one cited block) and asks one question.
2. The student replies with an attempt, or presses "Show me more" for the next hint (more specific, still not the answer).
3. When the student is right, the reply confirms it and adds the one-sentence "why", with a citation. When the student is wrong, it names the specific mix-up, not just "not quite".
4. "Just tell me" reveals the full cited answer at any rung.

Ladder state lives in the conversation itself: the mode is stored per message, and the system prompt tells the model which rung it is on. No extra table is needed.

**Quiz design.** Questions are written for retrieval, not recognition:

- Each wrong option is a real misconception from the chapter (e.g. confusing the row picture with the column picture), and carries a one-line note on that misconception, shown when it is picked.
- Every question cites the block that answers it, so "rewatch" jumps to the right moment.
- Stretch: "explain it in your own words" questions, marked by Claude against the board content; missed questions resurface in later sessions (spaced repetition).

**Why not fine-tuning.**

- Fine-tuning mainly changes tone and format. Current models already know Socratic questioning, worked examples and retrieval practice; what they need is a product that makes them use those at the right moment, which is prompt and app design.
- It needs hundreds to thousands of example tutoring conversations, which do not exist for this project.
- A fine-tuned model is pinned to an older base model; prompts move to every new model for free.
- Check current availability before revisiting; the decision does not depend on it.

**How we know it teaches.** A small eval replaces fine-tuning as the quality loop: 10 questions on the demo lecture, each run in Guide me, graded against a rubric:

- the first reply does not reveal the answer;
- every hint cites a real block, and the block is the relevant one;
- a wrong attempt gets the specific misconception, not a generic "try again";
- the answer, once revealed, matches the board.

Prompt changes to the modes are kept only if this score holds or improves.

## Tech stack and architecture

A TypeScript monorepo with a React frontend and a long-running Node server; the pipeline runs as a background job on that server, never in a request handler or a serverless function.

&#91;embedded content: architecture · 6 components\]

The browser uploads and asks; the server starts a job and answers questions; the job runner does the slow work and writes everything to storage, which the server reads back.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + TypeScript, Vite, Tailwind | Usual stack; no server rendering needed |
| Backend | Node + TypeScript, Hono | Long-running process that can hold minutes-long jobs |
| Jobs | In-process queue polling the lectures table | One user, no need for Redis or a queue service |
| Database | SQLite via better-sqlite3 | One file, no server, easy to inspect |
| Media | ffmpeg via child\_process | Audio extraction and scene-change frames |
| Transcription | whisper.cpp locally; hosted Whisper API (e.g. Groq) when deployed, behind one `transcribe()` interface | whisper.cpp is fast on a Mac with Metal but takes 20 to 40+ min per hour of audio on a cloud CPU; the API takes about a minute |
| Hosting | Railway (or a small VPS), one Docker service, one instance, persistent volume at `data/` | Long-running process; Hono also serves the built Vite app, so one origin and no CORS |
| LLM | @anthropic-ai/sdk; claude-sonnet-5-5 for frames, chapters, Q&A and quiz (claude-haiku-5-5 optional for frames) | Haiku misread board numbers in testing; frame reading is a one-time cost per lecture, so accuracy wins |
| Validation | zod schemas on every model JSON output | Catch malformed chapters and fake citations early |
| Streaming | Server-sent events for answers | Simpler than websockets for one-way streams |

Repo layout: `web/` (React app), `server/` (API, job runner, pipeline stages one file each), `shared/` (types used by both).

Vite over Next.js is deliberate: Next pulls you towards Vercel and serverless functions, which is the wrong shape for a pipeline that runs for minutes.

**Deployment.** Judges get a live link. The app is deployed as one Docker image (Node and ffmpeg; the deployed server always uses the hosted Whisper API, so whisper.cpp stays local-only) on a host that keeps the process running:

- Exactly one instance, with scale-to-zero and auto-stop off. SQLite and the in-process queue assume a single process, and a stopped machine kills a running job.
- A persistent volume mounted at `data/` holds the SQLite file and all media. Size it for about 2 GB per lecture.
- Video is served with HTTP range requests, or the player cannot seek to citations.
- Uploads stream to disk, never buffered in memory. No Cloudflare proxy in front, since it caps request bodies at 100 MB. Check the host's own body-size and request-timeout limits before committing.
- The demo lecture is processed in advance on a Mac and seeded onto the volume, so the demo never depends on live processing. Live upload still works, as proof the pipeline is real.

**Abuse and cost guard.** A public link with no accounts spends real API money on every request, so:

- Uploads require a shared passcode (an env var, checked in middleware).
- At ingest, ffprobe rejects files over about 2 GB or about 90 minutes.
- Ask and Quiz are rate-limited per IP and overall.
- A monthly spend limit is set in the Anthropic console.

## Data model

SQLite holds structured records; media files (video, audio, frames) live on disk under `data/<lectureId>/` and SQLite stores their paths. Timestamps are stored as seconds (float) everywhere so the transcript and frames line up without conversion.

| Table | Key fields | Notes |
| --- | --- | --- |
| modules | id, name, createdAt | A folder of lectures |
| lectures | id, moduleId, title, videoPath, durationSec, status, failedStage, stageDone, stageTotal | status = which pipeline stage it reached; stageDone/stageTotal drive the progress row (e.g. 23/50 frames described) |
| transcript\_segments | id, lectureId, startSec, endSec, text | From whisper.cpp |
| frames | id, lectureId, atSec, imagePath, description | description filled in stage 4 |
| chapters | id, lectureId, idx, title, startSec, endSec, summary | From stage 6; a chapter's frames are those with atSec in [startSec, endSec), derived rather than stored |
| messages | id, lectureId, role, content, citations (JSON), mode | Ask tab history; mode is the teaching mode the message was asked in |
| quiz\_questions | id, chapterId, question, options (JSON), answerIdx, explanation, misconceptions (JSON, one note per wrong option), blockId, atSec | Generated on demand |

The merged timeline is not stored as its own table: it is built in code from transcript\_segments and frames whenever a prompt needs it, so there is only one source of truth for each stream.

## Cost and token budget

Processing one hour-long lecture costs roughly 70 to 80 US cents with Sonnet reading frames (about 10 cents with Haiku), a one-time cost per lecture, and each question costs about 1 cent with prompt caching (about 7 cents for the first question in a session, which writes the cache). Estimates are approximate, worked from a 1-hour lecture.

| Step | Tokens (approx.) | Model | Cost (USD, approx.) |
| --- | --- | --- | --- |
| Describe 80 frames (default) | 160k in, 27k out | Sonnet 5.5 | 0.60 (measured) |
| Describe 80 frames (cheap option) | 155k in, 23k out | Haiku 5.5 | 0.03 (measured) |
| Chapters | 25k in, 2k out | Sonnet 5.5 | 0.07 |
| One question, uncached | 25k in, 500 out | Sonnet 5.5 | 0.055 |
| First question in a session (cache write) | 25k cache write, 500 out | Sonnet 5.5 | 0.068 |
| One question, cached timeline | 25k cache read, 500 out | Sonnet 5.5 | 0.010 |

Prices used: Haiku 5.5 $0.10 in / $0.50 out per MTok; Sonnet 5.5 $2 in / $10 out, cache reads $0.20, 5-minute cache writes 1.25x input. The cache expires after 5 minutes without a question, so a session that pauses longer pays the write again.

Assumptions: about 15k transcript tokens per hour, about 1,900 input tokens per frame description (the current and previous frame images plus nearby transcript), a merged timeline of about 25 to 32k tokens (32k measured on a 40-minute board lecture). Transcription costs no tokens: it is free locally, and a few cents to tens of cents per hour through a hosted Whisper API on the deployed server.

Design consequences:

- Single-lecture Q&A sends the whole timeline in context with prompt caching. No retrieval or vector store in the MVP.
- Course-wide Q&A (stretch) is where retrieval earns its place: 20 lectures is about 500k tokens, roughly 1 US dollar per uncached question and worse answers when the relevant part is buried.
- Frame count is the main cost lever, so stage 3's threshold matters for budget as well as quality.
- Teaching modes cost the same per turn as a question: they share the cached timeline, and only the short mode instructions after it differ. A Guide me session is several short turns, so it costs a few cents in total.

Prices as of 2026-10-12: [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Risks and open questions

The biggest risk is deployment: the demo is a live link, and a pipeline that runs ffmpeg and transcription for minutes does not fit serverless hosting. The plan is a single long-running server with a seeded demo lecture (see Deployment), deployed early so problems surface while there is time to fix them.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Serverless (Vercel) cannot run ffmpeg/whisper for minutes | No live link for judges | Host on a long-running box (Railway or a VPS), one instance; deploy at Milestone 4, not at the end |
| Host scales to zero or restarts mid-job | Lecture stuck half-processed | Disable auto-stop; on startup, reset lectures left in a running state so the job resumes from the last completed stage |
| Upload limits on host or proxy | Large recordings fail to upload | Stream uploads to disk; no Cloudflare proxy; test a 1 to 2 GB upload against the live host early |
| Public link with no accounts | Anyone can spend API budget | Upload passcode, ffprobe size and duration caps, rate limits on Ask and Quiz, Anthropic console spend limit |
| Player cannot seek | Citation chips do nothing | Serve video with HTTP range requests; verify on the live host at Milestone 4 |
| Frame model misreads equations | The core differentiator fails in the demo | Sonnet for frames (Haiku misread in testing); prompt requires marking unreadable characters rather than guessing; send nearby transcript as context; review the contact sheet of the demo lecture |
| Scene detection grabs too many or too few frames | Cost spikes or missed slides | Tune threshold on one real lecture; perceptual-hash dedup; 60 s floor; cap at 80 frames |
| Scene detection misses whiteboard content | The board is captured half-written, or the full board is lost when erased | Compare against the last kept frame, not the previous frame; keep the frame just before each big change |
| Transcription slow on a cloud CPU | Live uploads take 20 to 40+ min | Hosted Whisper API on the deployed server; demo lecture is seeded, never processed live |
| Recording rights | Using UCL lecture content publicly | Demo with a lecture you are allowed to show, or an openly licensed lecture (e.g. MIT OCW) |
| Hallucinated citations | Loss of trust, weak pitch | Model cites block IDs only; server checks each ID as it streams in and drops unknown ones before rendering |
| Guide me leaks the answer in the first hint, or frustrates a student who just needs it | The mode feels fake, or annoying | Teaching eval rubric (see Teaching approach); "Just tell me" is always one click away |
| Teaching features read as scope creep to judges | Dilutes the 30-second differentiator | Lead the demo with the board-reading answer; show Guide me second, as the reason it teaches rather than summarises |
| Board misread in wide camera shots (low resolution) | Confidently wrong numbers in answers and hints | Describe prompt: transcribe only legible characters, mark unclear digits; later, merge same-board frames and keep the close-up |

Open questions:

- [ ] Submission deadline
- [x] Live link or video demo: live link, with a recorded backup video (decided 2026-10-12)
- [x] Exact stack: Vite and Hono (see Tech stack)
- [ ] Host: Railway or a VPS, after checking upload body-size and timeout limits
- [ ] Hosted Whisper provider for the deployed server
- [ ] Product name
- [x] Haiku 5.5 price per token: $0.10 / $0.50 per MTok, so the $0.01 frame row stands
- [ ] Architecture diagram: the embedded diagram did not survive export and needs redrawing
- [ ] Which lecture to use for the demo

## Milestones and demo

Build in this order, and treat each milestone as done only when it runs cleanly on a real lecture. Dates depend on the submission deadline, still open.

**Milestone 0: go/no-go, before any code.** Choose the demo lecture (whiteboard- or code-heavy). Give NotebookLM its transcript and any published slides, then ask the planned demo question. If NotebookLM answers it well, the pitch fails on stage: switch lectures, or rethink the project around another input that a chat window cannot take. Record the result either way.

1. **Pipeline from the command line.** Stages 1 to 5 run on one real lecture via a script; output inspected by hand. No UI yet. This de-risks transcription, frame capture and Haiku's equation reading. Done means: no whiteboard state is lost before an erase, no slide is described twice, and Haiku's LaTeX matches the worst board in the lecture.
2. **Chapters and Q&A from the command line.** Stage 6 plus a script that answers a question with citations. Every cited block ID resolves to a real timeline block, checked while the answer streams.
3. **Lecture view.** Player, Outline and Ask tabs on a pre-processed lecture. Citations seek the player; frames show.
4. **Deploy early.** The lecture view and one seeded, pre-processed lecture run on the live host: Docker image, one instance, volume, range-request video seeking verified. Upload, passcode and rate limits arrive in Milestone 5.
5. **Upload and progress.** Upload from the browser, pipeline runs in the background, progress per stage, retry from a failed stage. Built and tested against the live host, including a 1 to 2 GB upload, the hosted Whisper API and the abuse guard.
6. **Quiz tab and modules.** Chapter quiz built for retrieval: misconception notes on wrong options, cited rewatch timestamps. Group lectures into modules.
7. **Guide me and the teaching eval.** Mode switch in Ask, hint ladder, "Show me more" and "Just tell me" buttons. Write the 10-question rubric eval and tune the prompt against it. Done means: no first reply in the eval reveals the answer, and every hint cites the relevant block.
8. **Demo polish and recording.** Seed the final demo lecture on the live host, rehearse on the live link, record a backup video.
9. **Stretch, in order:** see Scope.

**Demo script (about 2.5 minutes)**

1. Show NotebookLM on the same lecture: ask a question whose answer is only on a slide. It cannot answer, or answers vaguely.
2. Ask Lecture Lens the same question. The answer includes the equation, the slide thumbnail and a timestamp; click it and the video jumps there.
3. Switch to Guide me and ask a "how do I…" question. The reply points at the board ("look at 12:41: which combination reaches b?") instead of giving the answer; answer it, get it confirmed with the why.
4. Show the chapter outline as the two-minute overview.
5. Take the quiz on that chapter, get one wrong, see the misconception note, use its timestamp to rewatch.
