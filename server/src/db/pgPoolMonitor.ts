import type { Pool, PoolClient } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";

type RegisteredPool = {
	pool: Pool;
	name: string;
	max: number;
};

type AcquireStats = {
	count: number;
	timeouts: number;
	errors: number;
	observed: number;
	samples: number[];
};

/** Caps per-interval percentile memory; `count` keeps counting past it. */
export const MAX_ACQUIRE_SAMPLES = 5_000;

const registry = new Map<string, RegisteredPool>();
const acquireStats = new Map<string, AcquireStats>();
let snapshotInterval: ReturnType<typeof setInterval> | null = null;

const emptyAcquireStats = (): AcquireStats => ({
	count: 0,
	timeouts: 0,
	errors: 0,
	observed: 0,
	samples: [],
});

/** Algorithm R reservoir insert: `samples` stays a uniform sample of all `observed` values. */
export const reservoirInsert = ({
	samples,
	observed,
	value,
	capacity = MAX_ACQUIRE_SAMPLES,
}: {
	samples: number[];
	observed: number;
	value: number;
	capacity?: number;
}): void => {
	if (samples.length < capacity) {
		samples.push(value);
		return;
	}
	const slot = Math.floor(Math.random() * observed);
	if (slot < capacity) {
		samples[slot] = value;
	}
};

/** Busy fraction of the pool; idle clients don't count as utilized. */
export const computeUtilization = ({
	totalCount,
	idleCount,
	max,
}: {
	totalCount: number;
	idleCount: number;
	max: number;
}): number => {
	if (max <= 0) return 0;
	const busyCount = totalCount - idleCount;
	return Math.min(1, Math.max(0, busyCount / max));
};

const recordAcquire = ({
	name,
	durationMs,
	error,
}: {
	name: string;
	durationMs: number;
	error?: Error | null;
}): void => {
	const stats = acquireStats.get(name);
	if (!stats) return;
	stats.count++;
	if (error) {
		if (error.message?.includes("timeout exceeded when trying to connect")) {
			stats.timeouts++;
		} else {
			stats.errors++;
		}
		return;
	}
	stats.observed++;
	reservoirInsert({
		samples: stats.samples,
		observed: stats.observed,
		value: durationMs,
	});
};

type ConnectCallback = (
	err: Error | undefined,
	client: PoolClient | undefined,
	done: (release?: unknown) => void,
) => void;

/** Times every checkout (queue wait included) — pg-pool exposes no acquire hook. */
const timeAcquires = ({ pool, name }: { pool: Pool; name: string }): void => {
	const original = pool.connect.bind(pool);
	const timed = (callback?: ConnectCallback) => {
		const startedAt = performance.now();
		if (callback) {
			return original((err, client, done) => {
				recordAcquire({
					name,
					durationMs: performance.now() - startedAt,
					error: err,
				});
				callback(err, client, done);
			});
		}
		return original().then(
			(client) => {
				recordAcquire({ name, durationMs: performance.now() - startedAt });
				return client;
			},
			(error: Error) => {
				recordAcquire({
					name,
					durationMs: performance.now() - startedAt,
					error,
				});
				throw error;
			},
		);
	};
	pool.connect = timed as Pool["connect"];
};

const percentileOf = (sorted: number[], p: number): number =>
	sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ??
	0;

const getRole = (): string => {
	if (process.env.WORKER === "true") return "worker";
	if (process.env.CRON === "true") return "cron";
	return "http";
};

export const registerPool = ({
	pool,
	name,
	max,
}: {
	pool: Pool;
	name: string;
	max: number;
}): void => {
	registry.set(name, { pool, name, max });
	acquireStats.set(name, emptyAcquireStats());
	timeAcquires({ pool, name });
};

export const attachPoolErrorHandlers = ({
	pool,
	name,
}: {
	pool: Pool;
	name: string;
}): void => {
	pool.on("error", (err: Error & { code?: string }) => {
		logger.warn("pg_pool_error", {
			type: "pg_pool_error",
			pool: name,
			pid: process.pid,
			role: getRole(),
			error_code: err.code,
			error_name: err.name,
			error_message: err.message,
		});
	});
};

const emitSnapshot = (): void => {
	const role = getRole();
	for (const { pool, name, max } of registry.values()) {
		const totalCount = pool.totalCount;
		const idleCount = pool.idleCount;
		const waitingCount = pool.waitingCount;
		const stats = acquireStats.get(name);
		const sorted = stats ? [...stats.samples].sort((a, b) => a - b) : [];
		// info, not debug: prod runs above debug level, and waitingCount is the
		// only direct signal of pool-checkout starvation.
		logger.info("pg_pool_stats", {
			type: "pg_pool_stats",
			pool: name,
			pid: process.pid,
			role,
			totalCount,
			idleCount,
			waitingCount,
			max,
			utilization: computeUtilization({ totalCount, idleCount, max }),
			acquireCount: stats?.count ?? 0,
			acquireTimeouts: stats?.timeouts ?? 0,
			acquireErrors: stats?.errors ?? 0,
			...(sorted.length > 0 && {
				acquireP50Ms: Math.round(percentileOf(sorted, 50)),
				acquireP95Ms: Math.round(percentileOf(sorted, 95)),
				acquireP99Ms: Math.round(percentileOf(sorted, 99)),
				acquireMaxMs: Math.round(sorted[sorted.length - 1] ?? 0),
			}),
		});
		if (stats) {
			acquireStats.set(name, emptyAcquireStats());
		}
	}
};

export const startPgPoolMonitor = (intervalMs = 30_000): void => {
	if (snapshotInterval) return;
	// Pool snapshots are an ops signal; locally they just flood the console.
	if (process.env.NODE_ENV === "development") return;
	// Not unref'd: under Bun an unref'd interval was never observed to fire, and
	// the server keeps the loop alive anyway — stopPgPoolMonitor clears it.
	snapshotInterval = setInterval(emitSnapshot, intervalMs);
	emitSnapshot();
	logger.info("[PgPoolMonitor] Started", {
		type: "pg_pool_monitor_start",
		intervalMs,
		pools: Array.from(registry.keys()),
	});
};

export const stopPgPoolMonitor = (): void => {
	if (snapshotInterval) {
		clearInterval(snapshotInterval);
		snapshotInterval = null;
	}
};

export const getRegisteredPoolsForTesting = (): string[] =>
	Array.from(registry.keys());
