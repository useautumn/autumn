import type { ThreadCounters } from "../threads/stats/threadStats.js";

/** Measure-only: this thread's counters, reachable from the hop paths without threading ctx. */
export const measureDiag = { counters: null as ThreadCounters | null };

export const diagAdd = (field: Parameters<ThreadCounters["add"]>[0], by = 1) =>
	measureDiag.counters?.add(field, by);
