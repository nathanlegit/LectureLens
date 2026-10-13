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

  useEffect(() => {
    setText(read(key));
    setSaved(true);
  }, [key]);

  const update = (next: string) => {
    setText(next);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, next);
        setSaved(true);
      } catch {
        // storage full or blocked: keep showing "not saved"
      }
    }, 400);
  };

  return { text, update, saved };
}
