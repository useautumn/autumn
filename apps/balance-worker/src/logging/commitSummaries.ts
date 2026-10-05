import type { AutumnLogger } from "@autumn/logging";
import type { CommitWaits } from "../processor/writer/types/partitionWriter.js";

/** Each partition's commits and store applies this window, summed: a few additions per batch, never per request. */
export type CommitSummaries = {
	committed(params: {
		partition: number;
		records: number;
		durationMs: number;
		waits?: CommitWaits;
		result: "committed" | "not_committed" | "unknown";
	}): void;
	applied(params: {
		partition: number;
		durationMs: number;
		failed: boolean;
	}): void;
	/** The window's summaries, one row per partition so the line's field set stays fixed; starts the next window. */
	drain(): CommitSummaryRow[];
};

type Timing = { totalMs: number; maxMs: number };

type CommitSummaryRow = { partition: number } & CommitSummary;

type CommitSummary = {
	commits: number;
	records: number;
	notCommitted: number;
	unknown: number;
	commitMs: Timing;
	lingerMs: Timing;
	storeWaitMs: Timing;
	/** The longest any batch's oldest awaited write waited to be taken. */
	queuedMsMax: number;
	applies: number;
	applyFailed: number;
	applyMs: Timing;
};

export function createCommitSummaries(): CommitSummaries {
	let window = new Map<number, CommitSummary>();

	function summaryOf(partition: number): CommitSummary {
		let summary = window.get(partition);
		if (!summary) {
			summary = emptySummary();
			window.set(partition, summary);
		}
		return summary;
	}

	function committed({
		partition,
		records,
		durationMs,
		waits,
		result,
	}: Parameters<CommitSummaries["committed"]>[0]): void {
		const summary = summaryOf(partition);
		summary.commits += 1;
		summary.records += records;
		if (result === "not_committed") summary.notCommitted += 1;
		if (result === "unknown") summary.unknown += 1;
		add({ timing: summary.commitMs, ms: durationMs });
		if (!waits) return;
		add({ timing: summary.lingerMs, ms: waits.lingerMs });
		add({ timing: summary.storeWaitMs, ms: waits.storeWaitMs });
		if (waits.queuedMs !== null && waits.queuedMs > summary.queuedMsMax)
			summary.queuedMsMax = waits.queuedMs;
	}

	function applied({
		partition,
		durationMs,
		failed,
	}: Parameters<CommitSummaries["applied"]>[0]): void {
		const summary = summaryOf(partition);
		summary.applies += 1;
		if (failed) summary.applyFailed += 1;
		add({ timing: summary.applyMs, ms: durationMs });
	}

	function drain(): CommitSummaryRow[] {
		const drained = window;
		window = new Map();
		return [...drained].map(([partition, summary]) => ({
			partition,
			...rounded(summary),
		}));
	}

	return { committed, applied, drain };
}

function emptySummary(): CommitSummary {
	const timing = () => ({ totalMs: 0, maxMs: 0 });
	return {
		commits: 0,
		records: 0,
		notCommitted: 0,
		unknown: 0,
		commitMs: timing(),
		lingerMs: timing(),
		storeWaitMs: timing(),
		queuedMsMax: 0,
		applies: 0,
		applyFailed: 0,
		applyMs: timing(),
	};
}

function add({ timing, ms }: { timing: Timing; ms: number }): void {
	timing.totalMs += ms;
	if (ms > timing.maxMs) timing.maxMs = ms;
}

function rounded(summary: CommitSummary): CommitSummary {
	const round = ({ totalMs, maxMs }: Timing) => ({
		totalMs: Math.round(totalMs * 100) / 100,
		maxMs: Math.round(maxMs * 100) / 100,
	});
	return {
		...summary,
		commitMs: round(summary.commitMs),
		lingerMs: round(summary.lingerMs),
		storeWaitMs: round(summary.storeWaitMs),
		queuedMsMax: Math.round(summary.queuedMsMax * 100) / 100,
		applyMs: round(summary.applyMs),
	};
}

/** One per worker: every partition's commit logging adds to it, and the event-loop summary drains it. */
export const commitSummaries = createCommitSummaries();

/** One `balance_worker.commit_window` line per partition active this window, every line with the same keys. */
export function logCommitWindows({
	ctx,
	config,
}: {
	ctx: { logger: Pick<AutumnLogger, "info">; summaries: CommitSummaries };
	config: { deployment: string; endpoint: string };
}): void {
	for (const row of ctx.summaries.drain())
		ctx.logger.info(
			{
				event: "balance_worker.commit_window",
				workerDeployment: config.deployment,
				data: { workerEndpoint: config.endpoint, ...row },
			},
			"Balance worker partition commit window",
		);
}
