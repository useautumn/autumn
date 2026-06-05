import type { Pool } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";

type RegisteredPool = {
	pool: Pool;
	name: string;
	max: number;
};

const registry = new Map<string, RegisteredPool>();
let snapshotInterval: ReturnType<typeof setInterval> | null = null;

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
	// const role = getRole();
	// for (const { pool, name, max } of registry.values()) {
	// 	const totalCount = pool.totalCount;
	// 	const idleCount = pool.idleCount;
	// 	const waitingCount = pool.waitingCount;
	// 	logger.debug("pg_pool_stats", {
	// 		type: "pg_pool_stats",
	// 		pool: name,
	// 		pid: process.pid,
	// 		role,
	// 		totalCount,
	// 		idleCount,
	// 		waitingCount,
	// 		max,
	// 		utilization: max > 0 ? totalCount / max : 0,
	// 	});
	// }
};

export const startPgPoolMonitor = (intervalMs = 30_000): void => {
	if (snapshotInterval) return;
	snapshotInterval = setInterval(emitSnapshot, intervalMs);
	if (snapshotInterval.unref) snapshotInterval.unref();
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
