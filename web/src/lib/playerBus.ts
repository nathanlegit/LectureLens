import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * The one video player on the lecture page, as seen by the tabs: anything can ask it to seek,
 * and anything can follow its current time (to highlight the chapter being watched).
 *
 * The video reports its time about 4 times a second. Components subscribe through selectors so
 * they re-render only when what they show changes (the active line, the whole second), not on
 * every tick.
 */
type Listener = (sec: number) => void;
const seekListeners = new Set<Listener>();
const timeListeners = new Set<() => void>();
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
    timeListeners.forEach((l) => l());
  },
};

const subscribe = (l: () => void) => {
  timeListeners.add(l);
  return () => void timeListeners.delete(l);
};

/**
 * Re-renders only when `select(time)` changes (compared with Object.is). Keep the selected value
 * a primitive, such as an index or a whole number of seconds.
 */
export function usePlayerSelect<T>(select: (time: number) => T): T {
  const selectRef = useRef(select);
  selectRef.current = select;
  const getSnapshot = useCallback(() => selectRef.current(currentTime), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The current time in whole seconds: at most one re-render a second. */
export function usePlayerSecond(): number {
  return usePlayerSelect(Math.floor);
}
