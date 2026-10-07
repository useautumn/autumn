import type { AutumnLogger } from "@autumn/logging";

export type CachePushTiming = {
	targetsMs: number;
	readMs: number;
	sendMs: number;
};

const STATS_EVERY_MS = 10_000;
/** A change requested further back than this was backdated by its caller, not delayed by the pipeline. */
const MAX_PLAUSIBLE_AGE_MS = 60_000;

const percentile = ({ sorted, p }: { sorted: number[]; p: number }) =>
	sorted.length === 0
		? null
		: Math.round(
				sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))],
			);

const summarize = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return {
		p50: percentile({ sorted, p: 0.5 }),
		p99: percentile({ sorted, p: 0.99 }),
		max: percentile({ sorted, p: 1 }),
	};
};

const emptyWindow = () => ({
	targetsMs: [] as number[],
	readMs: [] as number[],
	sendMs: [] as number[],
	totalMs: [] as number[],
	recordAgeMs: [] as number[],
	enqueueAgeMs: [] as number[],
	backdated: 0,
	skipped: 0,
	failed: 0,
});

/** Where a push's time goes (the worker read vs the Atom write), logged every few seconds rather than per push. */
export function createCachePushStats({
	logger,
	queueDepth,
}: {
	logger: Pick<AutumnLogger, "info">;
	queueDepth: () => { pending: number; active: number };
}) {
	let window = emptyWindow();

	function flush(): void {
		const { readMs, skipped, failed } = window;
		if (readMs.length + skipped + failed === 0) return;
		logger.info(
			{
				type: "herald_cache_push_stats",
				data: {
					windowMs: STATS_EVERY_MS,
					pushes: readMs.length,
					skipped,
					failed,
					targetsMs: summarize(window.targetsMs),
					readMs: summarize(readMs),
					sendMs: summarize(window.sendMs),
					totalMs: summarize(window.totalMs),
					recordAgeMs: summarize(window.recordAgeMs),
					enqueueAgeMs: summarize(window.enqueueAgeMs),
					backdated: window.backdated,
					...queueDepth(),
				},
			},
			"herald cache push timings",
		);
		window = emptyWindow();
	}

	const timer = setInterval(flush, STATS_EVERY_MS);
	timer.unref?.();

	return {
		/** totalMs is from the subject leaving the queue to its push settling; ageMs is from the change's request to that settle. */
		recordPush: ({
			targetsMs,
			readMs,
			sendMs,
			totalMs,
			ageMs,
		}: CachePushTiming & { totalMs: number; ageMs: number }) => {
			window.targetsMs.push(targetsMs);
			window.readMs.push(readMs);
			window.sendMs.push(sendMs);
			window.totalMs.push(totalMs);
			if (ageMs > MAX_PLAUSIBLE_AGE_MS) window.backdated++;
			else window.recordAgeMs.push(ageMs);
		},
		/** From the change's request to herald queueing it: the balance worker's commit plus herald's fetch. */
		recordEnqueue: ({ ageMs }: { ageMs: number }) => {
			if (ageMs <= MAX_PLAUSIBLE_AGE_MS) window.enqueueAgeMs.push(ageMs);
		},
		recordSkip: () => {
			window.skipped++;
		},
		recordFailure: () => {
			window.failed++;
		},
	};
}
