import type { AutumnLogger } from "@autumn/logging";

export type CachePushTiming = {
	targetsMs: number;
	readMs: number;
	sendMs: number;
};

const STATS_EVERY_MS = 10_000;

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

/** Where a push's time goes (the worker read vs the Atom write), logged every few seconds rather than per push. */
export function createCachePushStats({
	logger,
	queueDepth,
}: {
	logger: Pick<AutumnLogger, "info">;
	queueDepth: () => { pending: number; active: number };
}) {
	let targets: number[] = [];
	let reads: number[] = [];
	let sends: number[] = [];
	let totals: number[] = [];
	let skipped = 0;
	let failed = 0;

	function flush(): void {
		if (reads.length + skipped + failed === 0) return;
		logger.info(
			{
				type: "herald_cache_push_stats",
				data: {
					windowMs: STATS_EVERY_MS,
					pushes: reads.length,
					skipped,
					failed,
					targetsMs: summarize(targets),
					readMs: summarize(reads),
					sendMs: summarize(sends),
					totalMs: summarize(totals),
					...queueDepth(),
				},
			},
			"herald cache push timings",
		);
		targets = [];
		reads = [];
		sends = [];
		totals = [];
		skipped = 0;
		failed = 0;
	}

	const timer = setInterval(flush, STATS_EVERY_MS);
	timer.unref?.();

	return {
		/** totalMs is from the subject leaving the queue to its push settling, so it includes event-loop wait. */
		recordPush: ({
			targetsMs,
			readMs,
			sendMs,
			totalMs,
		}: CachePushTiming & { totalMs: number }) => {
			targets.push(targetsMs);
			reads.push(readMs);
			sends.push(sendMs);
			totals.push(totalMs);
		},
		recordSkip: () => {
			skipped++;
		},
		recordFailure: () => {
			failed++;
		},
	};
}
