import type { DuckDBConnectionPool } from "@duckdbfan/drizzle-duckdb";
import {
	type AcquireStats,
	computeUtilization,
	emptyAcquireStats,
	getRole,
	percentileOf,
	reservoirInsert,
} from "@/db/pgPoolMonitor.js";
import { logger } from "../logtail/logtailUtils.js";

type RegisteredMdPool = {
	pool: DuckDBConnectionPool;
	name: string;
	max: number;
	/** Leased connections (acquired − released). Idle-open connections are
	 * invisible: the pool's internal counters are closure-private. */
	busyCount: number;
	/** Acquire calls in flight; sampled every 30s ≈ queued waiters, since
	 * fast-path acquires settle within the same tick. */
	waitingCount: number;
};

const registry = new Map<string, RegisteredMdPool>();
const acquireStats = new Map<string, AcquireStats>();
let snapshotInterval: ReturnType<typeof setInterval> | null = null;

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
		if (error.message?.includes("connection pool acquire timeout after")) {
			stats.timeouts++;
		} else {
			stats.errors++;
			// The DuckDB pool has no error emitter — the acquire failure path is
			// the only place to surface non-timeout errors.
			logger.warn("md_pool_error", {
				type: "md_pool_error",
				pool: name,
				pid: process.pid,
				role: getRole(),
				error_code: undefined,
				error_name: error.name,
				error_message: error.message,
			});
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

/** Times every checkout (queue wait included) by wrapping acquire/release —
 * the DuckDB pool exposes no hooks and no counters. */
const timeAcquires = ({ entry }: { entry: RegisteredMdPool }): void => {
	const { pool, name } = entry;
	const originalAcquire = pool.acquire.bind(pool);
	const originalRelease = pool.release.bind(pool);

	pool.acquire = (() => {
		const startedAt = performance.now();
		entry.waitingCount++;
		return originalAcquire().then(
			(connection) => {
				entry.waitingCount--;
				entry.busyCount++;
				recordAcquire({ name, durationMs: performance.now() - startedAt });
				return connection;
			},
			(error: Error) => {
				entry.waitingCount--;
				recordAcquire({
					name,
					durationMs: performance.now() - startedAt,
					error,
				});
				throw error;
			},
		);
	}) as DuckDBConnectionPool["acquire"];

	pool.release = ((connection) => {
		entry.busyCount = Math.max(0, entry.busyCount - 1);
		return originalRelease(connection);
	}) as DuckDBConnectionPool["release"];
};

export const registerMdPool = ({
	pool,
	name,
	max,
}: {
	pool: DuckDBConnectionPool;
	name: string;
	max: number;
}): void => {
	const entry: RegisteredMdPool = {
		pool,
		name,
		max,
		busyCount: 0,
		waitingCount: 0,
	};
	registry.set(name, entry);
	acquireStats.set(name, emptyAcquireStats());
	timeAcquires({ entry });
};

const emitSnapshot = (): void => {
	const role = getRole();
	for (const entry of registry.values()) {
		const { name, max, busyCount, waitingCount } = entry;
		const stats = acquireStats.get(name);
		const sorted = stats ? [...stats.samples].sort((a, b) => a - b) : [];
		// totalCount = leased connections only; idle-open connections are not
		// observable, so idleCount is always 0 and utilization = busy / max.
		logger.info("md_pool_stats", {
			type: "md_pool_stats",
			pool: name,
			pid: process.pid,
			role,
			totalCount: busyCount,
			idleCount: 0,
			waitingCount,
			max,
			utilization: computeUtilization({
				totalCount: busyCount,
				idleCount: 0,
				max,
			}),
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

export const startMdPoolMonitor = (intervalMs = 30_000): void => {
	if (snapshotInterval) return;
	// Pool snapshots are an ops signal; locally they just flood the console.
	if (process.env.NODE_ENV === "development") return;
	// Not unref'd for the same Bun reason as pgPoolMonitor.
	snapshotInterval = setInterval(emitSnapshot, intervalMs);
	emitSnapshot();
	logger.info("[MdPoolMonitor] Started", {
		type: "md_pool_monitor_start",
		intervalMs,
		pools: Array.from(registry.keys()),
	});
};

export const stopMdPoolMonitor = (): void => {
	if (snapshotInterval) {
		clearInterval(snapshotInterval);
		snapshotInterval = null;
	}
};
