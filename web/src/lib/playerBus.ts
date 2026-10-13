import { useEffect, useState } from "react";

/**
 * The one video player on the lecture page, as seen by the tabs: anything can ask it to seek,
 * and anything can follow its current time (to highlight the chapter being watched).
 */
type Listener = (sec: number) => void;
const seekListeners = new Set<Listener>();
const timeListeners = new Set<Listener>();
let currentTime = 0;

export const playerBus = {
  seek(sec: number) {
    seekListeners.forEach((l) => l(sec));
  },
  onSeek(l: Listener) {
    seekListeners.add(l);
    return () => void seekListeners.delete(l);
  },
  reportTime(sec: number) {
    currentTime = sec;
    timeListeners.forEach((l) => l(sec));
  },
};

export function usePlayerTime(): number {
  const [time, setTime] = useState(currentTime);
  useEffect(() => {
    timeListeners.add(setTime);
    return () => void timeListeners.delete(setTime);
  }, []);
  return time;
}
