import type { AtomHealth } from "./atomHealth.js";

/** Counters a chart turns into rates; each health line reports how much they grew since the line before. */
type IntervalCounter =
	| "requests"
	| "forwarded"
	| "shed"
	| "pushes"
	| "subjectMisses"
	| "subjectPulls"
	| "subjectFills"
	| "heldEvicted"
	| "heldExpired"
	| "diskEvicted"
	| "diskExpired"
	| "tracksAppended"
	| "appendFailed"
	| "journalForwardFailed"
	| "viewFoldKept"
	| "viewFoldRebuilt";

/** Totals since boot at one read, summed over every thread. */
export type HealthTotals = Record<IntervalCounter, number> & {
	at: number;
	cpuSeconds: number | null;
};

/** What happened between two reads, so a dashboard only ever sums: requests over seconds is RPS, CPU seconds over seconds × cores is CPU. */
export type HealthInterval = Record<IntervalCounter, number> & {
	seconds: number;
	cpuSeconds: number | null;
};

export const bootTotals = ({
	bootedAt,
}: {
	bootedAt: string;
}): HealthTotals => ({
	at: Date.parse(bootedAt),
	cpuSeconds: 0,
	requests: 0,
	forwarded: 0,
	shed: 0,
	pushes: 0,
	subjectMisses: 0,
	subjectPulls: 0,
	subjectFills: 0,
	heldEvicted: 0,
	heldExpired: 0,
	diskEvicted: 0,
	diskExpired: 0,
	tracksAppended: 0,
	appendFailed: 0,
	journalForwardFailed: 0,
	viewFoldKept: 0,
	viewFoldRebuilt: 0,
});

export const healthTotalsOf = ({
	health,
	at,
}: {
	health: AtomHealth;
	at: number;
}): HealthTotals => {
	const sumOf = (counter: IntervalCounter) =>
		health.threads.reduce((sum, thread) => sum + thread[counter], 0);
	return {
		at,
		cpuSeconds: health.container.cpuUsageSeconds,
		requests: sumOf("requests"),
		forwarded: sumOf("forwarded"),
		shed: sumOf("shed"),
		pushes: sumOf("pushes"),
		subjectMisses: sumOf("subjectMisses"),
		subjectPulls: sumOf("subjectPulls"),
		subjectFills: sumOf("subjectFills"),
		heldEvicted: sumOf("heldEvicted"),
		heldExpired: sumOf("heldExpired"),
		diskEvicted: sumOf("diskEvicted"),
		diskExpired: sumOf("diskExpired"),
		tracksAppended: sumOf("tracksAppended"),
		appendFailed: sumOf("appendFailed"),
		journalForwardFailed: sumOf("journalForwardFailed"),
		viewFoldKept: sumOf("viewFoldKept"),
		viewFoldRebuilt: sumOf("viewFoldRebuilt"),
	};
};

export const healthIntervalBetween = ({
	previous,
	current,
}: {
	previous: HealthTotals;
	current: HealthTotals;
}): HealthInterval => ({
	seconds: (current.at - previous.at) / 1000,
	cpuSeconds:
		current.cpuSeconds === null || previous.cpuSeconds === null
			? null
			: current.cpuSeconds - previous.cpuSeconds,
	requests: current.requests - previous.requests,
	forwarded: current.forwarded - previous.forwarded,
	shed: current.shed - previous.shed,
	pushes: current.pushes - previous.pushes,
	subjectMisses: current.subjectMisses - previous.subjectMisses,
	subjectPulls: current.subjectPulls - previous.subjectPulls,
	subjectFills: current.subjectFills - previous.subjectFills,
	heldEvicted: current.heldEvicted - previous.heldEvicted,
	heldExpired: current.heldExpired - previous.heldExpired,
	diskEvicted: current.diskEvicted - previous.diskEvicted,
	diskExpired: current.diskExpired - previous.diskExpired,
	tracksAppended: current.tracksAppended - previous.tracksAppended,
	appendFailed: current.appendFailed - previous.appendFailed,
	journalForwardFailed:
		current.journalForwardFailed - previous.journalForwardFailed,
	viewFoldKept: current.viewFoldKept - previous.viewFoldKept,
	viewFoldRebuilt: current.viewFoldRebuilt - previous.viewFoldRebuilt,
});
