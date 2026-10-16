import { useEffect, useRef, useState } from "react";

// Notes live in this browser only. The public demo has no accounts, so notes saved on the server
// would be shared by every visitor; per-browser notes keep each viewer's own.
const PREFIX = "lecture-lens-notes:";

function read(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

/** Notes text for a key, saved shortly after typing stops. */
export function useNotes(key: string) {
  const [text, setText] = useState(() => read(key));
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The save waiting on the debounce, so it can be written at once if the page goes away.
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    setText(read(key));
    setSaved(true);
    const flush = () => {
      clearTimeout(timer.current);
      pending.current?.();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush(); // leaving this lecture or module, or switching key
    };
  }, [key]);

  const update = (next: string) => {
    setText(next);
    setSaved(false);
    clearTimeout(timer.current);
    pending.current = () => {
      pending.current = null;
      try {
        localStorage.setItem(PREFIX + key, next);
        setSaved(true);
      } catch {
        // storage full or blocked: keep showing "not saved"
      }
    };
    timer.current = setTimeout(() => pending.current?.(), 400);
  };

  return { text, update, saved };
}
