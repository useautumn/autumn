import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Set by the supervisor on every child: where each process publishes its stall stats for /health. */
export const ATOM_STATS_DIR = "ATOM_STATS_DIR";

const LAG_PROBE_EVERY_MS = 20;
const PUBLISH_EVERY_MS = 1000;
/** A loop this late is logged once, so a stall carries an exact time and process. */
const STALL_LOGGED_AT_MS = 100;
const STATS_READ_EVERY_MS = 1000;

type Bucket = {
	loopLagMaxMs: number;
	checkMaxMs: number;
	pushMaxMs: number;
	forwardMaxMs: number;
	checks: number;
	pushes: number;
	forwards: number;
	/** Summed handler time, so time per check or push is a division, not a guess from CPU regressions. */
	checkTotalMs: number;
	pushTotalMs: number;
	pushBytes: number;
	/** Checks' subject reads, and how many of them parsed the row rather than reusing a parsed copy. */
	subjectReads: number;
	subjectParses: number;
	/** Summed ms of each answered check's phases; what is left of checkTotalMs is auth, body and routing. */
	checkReadMs: number;
	checkDecideMs: number;
	checkRenderMs: number;
	checkRespondMs: number;
	/** Connections that sent their first request here. */
	newConnections: number;
	/** How long a request sat behind others the loop handled first in the same burst: a floor on its wait. */
	queueWaitMaxMs: number;
	queueWaitTotalMs: number;
};

/** Maxima over the trailing two seconds, so a reader polling every 2 s misses no stall. */
export type ProcessStats = Bucket & { index: number; pid: number; at: string };

const PUSH_PATHS = new Set(["/v1/subjects.set", "/v1/catalog.set"]);

const emptyBucket = (): Bucket => ({
	loopLagMaxMs: 0,
	checkMaxMs: 0,
	pushMaxMs: 0,
	forwardMaxMs: 0,
	checks: 0,
	pushes: 0,
	forwards: 0,
	checkTotalMs: 0,
	pushTotalMs: 0,
	pushBytes: 0,
	subjectReads: 0,
	subjectParses: 0,
	checkReadMs: 0,
	checkDecideMs: 0,
	checkRenderMs: 0,
	checkRespondMs: 0,
	newConnections: 0,
	queueWaitMaxMs: 0,
	queueWaitTotalMs: 0,
});

const mergeBuckets = (a: Bucket, b: Bucket): Bucket => ({
	loopLagMaxMs: Math.max(a.loopLagMaxMs, b.loopLagMaxMs),
	checkMaxMs: Math.max(a.checkMaxMs, b.checkMaxMs),
	pushMaxMs: Math.max(a.pushMaxMs, b.pushMaxMs),
	forwardMaxMs: Math.max(a.forwardMaxMs, b.forwardMaxMs),
	checks: a.checks + b.checks,
	pushes: a.pushes + b.pushes,
	forwards: a.forwards + b.forwards,
	checkTotalMs: a.checkTotalMs + b.checkTotalMs,
	pushTotalMs: a.pushTotalMs + b.pushTotalMs,
	pushBytes: a.pushBytes + b.pushBytes,
	subjectReads: a.subjectReads + b.subjectReads,
	subjectParses: a.subjectParses + b.subjectParses,
	checkReadMs: a.checkReadMs + b.checkReadMs,
	checkDecideMs: a.checkDecideMs + b.checkDecideMs,
	checkRenderMs: a.checkRenderMs + b.checkRenderMs,
	checkRespondMs: a.checkRespondMs + b.checkRespondMs,
	newConnections: a.newConnections + b.newConnections,
	queueWaitMaxMs: Math.max(a.queueWaitMaxMs, b.queueWaitMaxMs),
	queueWaitTotalMs: a.queueWaitTotalMs + b.queueWaitTotalMs,
});

/** A lone process, with no supervisor, publishes where its own /health reads. */
export const atomStatsDir = ({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): string =>
	env[ATOM_STATS_DIR] ?? join(tmpdir(), `atom-stats-${process.pid}`);

export type ProcessStatsRecorder = {
	/** A forwarded check waits on the Autumn API, so it is timed apart from the checks Atom answers itself. */
	recordRequest(params: {
		path: string;
		durationMs: number;
		forwarded: boolean;
		bytes: number;
	}): void;
	/** Called as a request reaches the process, before any of its handling. */
	noteArrival(params: { remote: string | null }): void;
	stop(): void;
};

/** Running totals a process keeps elsewhere; each publish records how far they moved. */
export type SubjectReadCounts = { reads: number; parses: number };
export type CheckPhaseTotals = {
	read: number;
	decide: number;
	render: number;
	respond: number;
};

/** A connection idle this long and then seen again counts as new; far longer than any keep-alive gap under load. */
const CONNECTION_FORGOTTEN_AFTER_MS = 30_000;

/** Event-loop lag and request times per process: a stall with idle CPU shows here as lag without a slow handler. */
export const startProcessStats = ({
	index,
	statsDir = atomStatsDir(),
	logger,
	clock = () => performance.now(),
	now = () => new Date(),
	subjectReadCounts = () => ({ reads: 0, parses: 0 }),
	checkPhaseTotals = () => ({ read: 0, decide: 0, render: 0, respond: 0 }),
	afterLoopTurn = (callback: () => void) => setImmediate(callback),
}: {
	index: number;
	statsDir?: string;
	logger: { warn(fields: object, message: string): void };
	clock?: () => number;
	now?: () => Date;
	subjectReadCounts?: () => SubjectReadCounts;
	checkPhaseTotals?: () => CheckPhaseTotals;
	/** Runs once the loop has handled every request it read in this turn. */
	afterLoopTurn?: (callback: () => void) => void;
}): ProcessStatsRecorder & { publish(): void; probeLag(): void } => {
	mkdirSync(statsDir, { recursive: true });
	const file = join(statsDir, `process-${index}.json`);
	let current = emptyBucket();
	let previous = emptyBucket();
	let probedAt = clock();
	let publishedReads = { ...subjectReadCounts() };
	let publishedPhases = { ...checkPhaseTotals() };
	const connectionSeenAt = new Map<string, number>();
	let burstStartedAt: number | null = null;

	function endBurst(): void {
		burstStartedAt = null;
	}

	/** Requests read in one loop turn are handled one after another; each waits for those before it. */
	function noteArrival({ remote }: { remote: string | null }): void {
		const at = clock();
		if (burstStartedAt === null) {
			burstStartedAt = at;
			afterLoopTurn(endBurst);
		}
		const waitMs = at - burstStartedAt;
		current.queueWaitMaxMs = Math.max(current.queueWaitMaxMs, waitMs);
		current.queueWaitTotalMs += waitMs;
		if (remote === null) return;
		if (!connectionSeenAt.has(remote)) current.newConnections += 1;
		connectionSeenAt.set(remote, at);
	}

	function forgetIdleConnections(): void {
		const forgetBefore = clock() - CONNECTION_FORGOTTEN_AFTER_MS;
		for (const [remote, seenAt] of connectionSeenAt)
			if (seenAt < forgetBefore) connectionSeenAt.delete(remote);
	}

	function probeLag(): void {
		const at = clock();
		const lagMs = Math.max(0, at - probedAt - LAG_PROBE_EVERY_MS);
		probedAt = at;
		current.loopLagMaxMs = Math.max(current.loopLagMaxMs, lagMs);
		if (lagMs >= STALL_LOGGED_AT_MS)
			logger.warn(
				{ type: "atom_event_loop_stall", lagMs: Math.round(lagMs), index },
				`Event loop stalled ${Math.round(lagMs)}ms`,
			);
	}

	function publish(): void {
		const reads = subjectReadCounts();
		current.subjectReads = reads.reads - publishedReads.reads;
		current.subjectParses = reads.parses - publishedReads.parses;
		publishedReads = { ...reads };
		const phases = checkPhaseTotals();
		current.checkReadMs = phases.read - publishedPhases.read;
		current.checkDecideMs = phases.decide - publishedPhases.decide;
		current.checkRenderMs = phases.render - publishedPhases.render;
		current.checkRespondMs = phases.respond - publishedPhases.respond;
		publishedPhases = { ...phases };
		forgetIdleConnections();
		const stats: ProcessStats = {
			index,
			pid: process.pid,
			at: now().toISOString(),
			...mergeBuckets(previous, current),
		};
		for (const key of [
			"loopLagMaxMs",
			"checkMaxMs",
			"pushMaxMs",
			"forwardMaxMs",
			"checkTotalMs",
			"pushTotalMs",
			"checkReadMs",
			"checkDecideMs",
			"checkRenderMs",
			"checkRespondMs",
			"queueWaitMaxMs",
			"queueWaitTotalMs",
		] as const)
			stats[key] = Math.round(stats[key]);
		previous = current;
		current = emptyBucket();
		try {
			writeFileSync(file, JSON.stringify(stats));
		} catch {
			// Stats are best effort: a full or missing /tmp must not touch serving.
		}
	}

	function recordRequest({
		path,
		durationMs,
		forwarded,
		bytes,
	}: {
		path: string;
		durationMs: number;
		forwarded: boolean;
		bytes: number;
	}): void {
		if (forwarded) {
			current.forwards += 1;
			current.forwardMaxMs = Math.max(current.forwardMaxMs, durationMs);
		} else if (path === "/v1/balances.check") {
			current.checks += 1;
			current.checkMaxMs = Math.max(current.checkMaxMs, durationMs);
			current.checkTotalMs += durationMs;
		} else if (PUSH_PATHS.has(path)) {
			current.pushes += 1;
			current.pushMaxMs = Math.max(current.pushMaxMs, durationMs);
			current.pushTotalMs += durationMs;
			current.pushBytes += bytes;
		}
	}

	const lagTimer = setInterval(probeLag, LAG_PROBE_EVERY_MS);
	const publishTimer = setInterval(publish, PUBLISH_EVERY_MS);
	lagTimer.unref?.();
	publishTimer.unref?.();

	return {
		recordRequest,
		noteArrival,
		publish,
		probeLag,
		stop: () => {
			clearInterval(lagTimer);
			clearInterval(publishTimer);
		},
	};
};

/** Every process's latest stats, read at most once a second; a missing or torn file is skipped. */
export const createProcessStatsReader = ({
	statsDir = atomStatsDir(),
	clock = () => performance.now(),
}: {
	statsDir?: string;
	clock?: () => number;
} = {}): (() => ProcessStats[]) => {
	let stats: ProcessStats[] = [];
	let readAt = Number.NEGATIVE_INFINITY;

	const readAll = (): ProcessStats[] => {
		let names: string[];
		try {
			names = readdirSync(statsDir);
		} catch {
			return [];
		}
		return names
			.filter((name) => name.startsWith("process-"))
			.flatMap((name) => {
				try {
					return [
						JSON.parse(
							readFileSync(join(statsDir, name), "utf8"),
						) as ProcessStats,
					];
				} catch {
					return [];
				}
			})
			.sort((a, b) => a.index - b.index);
	};

	return () => {
		if (clock() - readAt < STATS_READ_EVERY_MS) return stats;
		readAt = clock();
		stats = readAll();
		return stats;
	};
};
