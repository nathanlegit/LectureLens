import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { formatTime } from "../lib/api";
import { useNotes } from "../lib/notes";
import { usePlayerSecond } from "../lib/playerBus";

/** A borderless, auto-growing notes area. With withTimestamps, it can stamp the video time. */
export function NotesEditor({ storageKey, placeholder, withTimestamps = false }: { storageKey: string; placeholder: string; withTimestamps?: boolean }) {
  const { text, update, saved } = useNotes(storageKey);
  const area = useRef<HTMLTextAreaElement>(null);
  const time = usePlayerSecond();

  useLayoutEffect(() => {
    const el = area.current;
    // A textarea in a hidden tab measures 0: leave its default rows rather than collapsing it.
    if (!el || el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const insertTimestamp = () => {
    const el = area.current;
    if (!el) return;
    const stamp = `[${formatTime(time)}] `;
    const { selectionStart: s, selectionEnd: e } = el;
    const atLineStart = s === 0 || text[s - 1] === "\n";
    const insert = (atLineStart ? "" : "\n") + stamp;
    // Render the new text synchronously, then focus and place the caret at once, so keystrokes
    // typed straight after the click land after the stamp rather than on the button.
    flushSync(() => update(text.slice(0, s) + insert + text.slice(e)));
    el.focus();
    el.setSelectionRange(s + insert.length, s + insert.length);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span key={saved ? "saved" : "saving"} className="anim-fade text-xs text-faint">
          {saved ? "Saved in this browser" : "Saving…"}
        </span>
        {withTimestamps && (
          <button type="button" onClick={insertTimestamp} className="btn btn-ghost btn-sm -mr-2 tabular-nums">
            + Timestamp {formatTime(time)}
          </button>
        )}
      </div>
      <textarea
        ref={area}
        value={text}
        onChange={(e) => update(e.target.value)}
        placeholder={placeholder}
        aria-label="Notes"
        rows={6}
        className="block w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}
