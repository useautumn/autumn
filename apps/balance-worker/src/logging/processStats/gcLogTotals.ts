/** Cumulative since the worker started, written by the launcher and diffed by the worker per report. */
export type GcTotals = {
	collections: number;
	edenCollections: number;
	fullCollections: number;
	/** Time the JS thread stood still for the collector: every increment's pause, plus finalizers. */
	pauseMs: number;
	/** The longest single pause in the last ten seconds. */
	maxPauseMs10s: number;
	/** Start to end of each collection, concurrent marking included. */
	cycleMs: number;
};

const PAUSE = /\bp=([\d.]+)ms/g;
const CYCLE = /cycle ([\d.]+)ms END/;
const FINALIZE = /: finalize ([\d.]+)ms\]/;
const MAX_WINDOW_MS = 10_000;

/** JSC's `logGC` lines, as `BUN_JSC_logGC=1` writes them to stderr. */
export function isGcLogLine(line: string): boolean {
	return (
		line.startsWith("[GC<") ||
		line === "GC END!" ||
		line.startsWith("Requesting GC because")
	);
}

/** Folds JSC's per-increment GC log into totals; a line it does not know is ignored. */
export function createGcLogTotals({
	now = Date.now,
}: {
	now?: () => number;
} = {}) {
	const totals: GcTotals = {
		collections: 0,
		edenCollections: 0,
		fullCollections: 0,
		pauseMs: 0,
		maxPauseMs10s: 0,
		cycleMs: 0,
	};
	let pauses: { at: number; ms: number }[] = [];

	function recordPause(ms: number): void {
		totals.pauseMs += ms;
		pauses.push({ at: now(), ms });
	}

	function consume(line: string): void {
		if (!line.startsWith("[GC<")) return;
		if (line.includes(": START ")) {
			totals.collections += 1;
			if (line.includes("=> EdenCollection")) totals.edenCollections += 1;
			else if (line.includes("=> FullCollection")) totals.fullCollections += 1;
		}
		for (const match of line.matchAll(PAUSE)) recordPause(Number(match[1]));
		const finalize = FINALIZE.exec(line);
		if (finalize) recordPause(Number(finalize[1]));
		const cycle = CYCLE.exec(line);
		if (cycle) totals.cycleMs += Number(cycle[1]);
	}

	function read(): GcTotals {
		const since = now() - MAX_WINDOW_MS;
		pauses = pauses.filter((pause) => pause.at >= since);
		let max = 0;
		for (const pause of pauses) max = Math.max(max, pause.ms);
		return { ...totals, maxPauseMs10s: max };
	}

	return { consume, read };
}
