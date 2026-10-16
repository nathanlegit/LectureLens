import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getJSON } from "./api";

// Notes live in this browser only. The public demo has no accounts, so notes saved on the server
// would be shared by every visitor; per-browser notes keep each viewer's own.
const PREFIX = "lecture-lens-notes:";

/** The saved notes, or null when this browser has never saved any for the key. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/**
 * Notes text for a key, saved shortly after typing stops. Until the visitor saves their own,
 * it shows the server's starter notes for the key, if any (the demo's example notes).
 */
export function useNotes(key: string) {
  const { data: starters } = useQuery({
    queryKey: ["starter-notes"],
    queryFn: () => getJSON<Record<string, string>>("/api/starter-notes"),
    staleTime: Infinity,
  });
  const [own, setText] = useState(() => read(key));
  const text = own ?? starters?.[key] ?? "";
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
