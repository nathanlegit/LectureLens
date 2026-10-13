import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lecture, ModuleWithLectures } from "@lecture-lens/shared";
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

export const weekLabel = (week: number | null) => (week === null ? "No week" : `Week ${week}`);

/** Lectures grouped by week in order, with lectures that have no week last. */
export function groupByWeek(lectures: Lecture[]): { week: number | null; lectures: Lecture[] }[] {
  const groups = new Map<number | null, Lecture[]>();
  for (const l of lectures) groups.set(l.week, [...(groups.get(l.week) ?? []), l]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([week, ls]) => ({ week, lectures: ls }));
}
