import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lecture, ModuleWithLectures, WeekInfo } from "@lecture-lens/shared";
import { getJSON } from "./api";

export const isProcessing = (l: Lecture) => l.status !== "ready" && l.status !== "failed";

/** All modules with their lectures; polls while anything is processing so progress stays live everywhere. */
export function useModules() {
  return useQuery({
    queryKey: ["modules"],
    queryFn: () => getJSON<ModuleWithLectures[]>("/api/modules"),
    refetchInterval: (q) => (q.state.data?.some((m) => m.lectures.some(isProcessing)) ? 2000 : false),
  });
}

export function useRefreshModules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["modules"] });
}

export const defaultWeekLabel = (week: number) => `Week ${week}`;

/** A week's display name: its custom title if it has one, otherwise "Week N" ("No week" for none). */
export function weekLabel(week: number | null, weeks: WeekInfo[] = []): string {
  if (week === null) return "No week";
  return weeks.find((w) => w.week === week)?.title || defaultWeekLabel(week);
}

export interface WeekGroup {
  week: number | null;
  label: string;
  lectures: Lecture[];
}

/** A module's weeks in order, including saved empty ones, with lectures that have no week last. */
export function groupWeeks(m: Pick<ModuleWithLectures, "lectures" | "weeks">): WeekGroup[] {
  const numbers = new Set<number>(m.weeks.map((w) => w.week));
  for (const l of m.lectures) if (l.week !== null) numbers.add(l.week);
  const groups: WeekGroup[] = [...numbers]
    .sort((a, b) => a - b)
    .map((week) => ({ week, label: weekLabel(week, m.weeks), lectures: m.lectures.filter((l) => l.week === week) }));
  const unsorted = m.lectures.filter((l) => l.week === null);
  if (unsorted.length > 0) groups.push({ week: null, label: weekLabel(null), lectures: unsorted });
  return groups;
}
