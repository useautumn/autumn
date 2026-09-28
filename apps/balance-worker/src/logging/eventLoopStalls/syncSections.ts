/** A stretch of synchronous work on the worker's one thread, long enough to delay everything queued behind it. */
export type SyncSection = {
	label: string;
	endedAt: number;
	durationMs: number;
};

export type SyncSectionTotals = Record<
	string,
	{ count: number; totalMs: number; maxMs: number }
>;

export type SyncSectionRecorder = {
	/** Runs `run` and records how long it held the thread. `run` must not await. */
	time<Value>({ label }: { label: string }, run: () => Value): Value;
	/** Recorded sections that finished at or after `since`, longest first. */
	endedSince({ since }: { since: number }): SyncSection[];
	/** Per-label totals since the last drain. */
	drainTotals(): SyncSectionTotals;
};

// Anything shorter cannot explain a stall worth reporting, so it is only counted.
const MIN_RECORDED_MS = 2;
const RECENT_CAPACITY = 256;

export function createSyncSectionRecorder({
	now = () => performance.now(),
}: {
	now?: () => number;
} = {}): SyncSectionRecorder {
	const recent: SyncSection[] = [];
	let totals: SyncSectionTotals = {};

	function record({
		label,
		startedAt,
	}: {
		label: string;
		startedAt: number;
	}): void {
		const endedAt = now();
		const durationMs = endedAt - startedAt;
		const total = totals[label] ?? { count: 0, totalMs: 0, maxMs: 0 };
		totals[label] = total;
		total.count += 1;
		total.totalMs += durationMs;
		total.maxMs = Math.max(total.maxMs, durationMs);
		if (durationMs < MIN_RECORDED_MS) return;
		recent.push({ label, endedAt, durationMs });
		if (recent.length > RECENT_CAPACITY) recent.shift();
	}

	function time<Value>({ label }: { label: string }, run: () => Value): Value {
		const startedAt = now();
		try {
			return run();
		} finally {
			record({ label, startedAt });
		}
	}

	function endedSince({ since }: { since: number }): SyncSection[] {
		return recent
			.filter((section) => section.endedAt >= since)
			.sort((a, b) => b.durationMs - a.durationMs);
	}

	function drainTotals(): SyncSectionTotals {
		const drained = totals;
		totals = {};
		return drained;
	}

	return { time, endedSince, drainTotals };
}

/** The process's recorder: the worker has one thread, so one record of what held it. */
export const syncSections = createSyncSectionRecorder();

export function timeSync<Value>(
	{ label }: { label: string },
	run: () => Value,
): Value {
	return syncSections.time({ label }, run);
}
