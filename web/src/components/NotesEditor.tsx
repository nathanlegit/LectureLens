import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { formatTime } from "../lib/api";
import { useNotes } from "../lib/notes";
import { usePlayerSecond } from "../lib/playerBus";
import { Markdown } from "./Markdown";

/**
 * Notion-style notes: Markdown renders in place, and clicking it opens the source for editing.
 * Clicking away renders it again. With withTimestamps, it can stamp the video time, and the
 * stamps render as chips that seek the video.
 */
export function NotesEditor({ storageKey, placeholder, withTimestamps = false }: { storageKey: string; placeholder: string; withTimestamps?: boolean }) {
  const { text, update, saved } = useNotes(storageKey);
  const area = useRef<HTMLTextAreaElement>(null);
  const time = usePlayerSecond();
  const [editing, setEditing] = useState(false);
  const showRendered = !editing && text.trim() !== "";

  useLayoutEffect(() => {
    const el = area.current;
    // A textarea in a hidden tab measures 0: leave its default rows rather than collapsing it.
    if (!el || el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, showRendered]);

  /** Open the source with the caret at `at` (the end by default). */
  const edit = (at = text.length) => {
    flushSync(() => setEditing(true));
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(at, at);
  };

  const openFromRendered = (e: MouseEvent) => {
    // Chips seek the video and links open; only a click on the text itself starts editing.
    if ((e.target as HTMLElement).closest("a, button, input")) return;
    if (window.getSelection()?.toString()) return; // selecting text to copy, not editing
    edit();
  };

  const insertTimestamp = () => {
    const el = area.current;
    if (!el) return;
    const stamp = `[${formatTime(time)}] `;
    const [s, e] = editing ? [el.selectionStart, el.selectionEnd] : [text.length, text.length];
    const atLineStart = s === 0 || text[s - 1] === "\n";
    const insert = (atLineStart ? "" : "\n") + stamp;
    // Render the new text synchronously, then focus and place the caret at once, so keystrokes
    // typed straight after the click land after the stamp rather than on the button.
    flushSync(() => update(text.slice(0, s) + insert + text.slice(e)));
    edit(s + insert.length);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span key={saved ? "saved" : "saving"} className="anim-fade text-xs text-faint">
          {saved ? "Saved in this browser" : "Saving…"}
          {editing && <span className="text-faint"> · Markdown and $math$ supported</span>}
        </span>
        {withTimestamps && (
          <button
            type="button"
            // Keep focus in the textarea, so stamping doesn't flash the rendered view.
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertTimestamp}
            className="btn btn-ghost btn-sm -mr-2 tabular-nums"
          >
            + Timestamp {formatTime(time)}
          </button>
        )}
      </div>
      {showRendered && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Notes. Press Enter to edit"
          onClick={openFromRendered}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target === e.currentTarget) {
              e.preventDefault();
              edit();
            }
          }}
          className="anim-fade -mx-2 min-h-36 cursor-text rounded-md px-2 py-0.5 text-[15px] transition-colors hover:bg-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <Markdown timestamps={withTimestamps} className="prose-p:leading-relaxed text-[15px]">
            {text}
          </Markdown>
        </div>
      )}
      <textarea
        ref={area}
        value={text}
        onChange={(e) => update(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        placeholder={placeholder}
        aria-label="Notes"
        rows={6}
        hidden={showRendered}
        className="block w-full resize-none bg-transparent font-mono text-[13.5px] leading-relaxed text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-faint"
      />
    </div>
  );
}
