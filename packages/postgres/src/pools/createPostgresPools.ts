import { BALANCE_WORKER_DATABASE_POOL_SIZE } from "@autumn/env/balanceWorkerConstants";
import type { PostgresPoolProfile } from "./types/postgresPoolProfile.js";

type RuntimeEnv = Record<string, string | undefined>;

const positiveInt = (value: string | undefined): number | undefined => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** statement_timeout the critical and balance-worker roles carry; a flush SET LOCALs the same value explicitly. */
const ROLE_STATEMENT_TIMEOUT_MS = 2_000;

/**
 * Every Postgres pool the Autumn processes open, one row each. Production runs the strict clocks; everywhere
 * else they relax so local pool warm-up never fails a test. `*_DB_POOL_MAX` env vars override a pool's size.
 */
export const createPostgresPools = ({
	runtimeEnv,
}: {
	runtimeEnv: RuntimeEnv;
}) => {
	const production = runtimeEnv.NODE_ENV === "production";
	const poolMax = ({
		envVar,
		fallback,
	}: {
		envVar: string;
		fallback: number;
	}) => positiveInt(runtimeEnv[envVar]) ?? fallback;

	const criticalMax = poolMax({
		envVar: "CRITICAL_DB_POOL_MAX",
		fallback: production ? 22 : 10,
	});
	const replicaMax = poolMax({ envVar: "REPLICA_DB_POOL_MAX", fallback: 9 });
	/** An in-flight migration customer can hold two connections: its transaction plus a standalone read or write. */
	const migrationCustomerConcurrency =
		positiveInt(runtimeEnv.MIGRATION_RUN_CUSTOMER_CONCURRENCY) ?? 50;

	return {
		/** Check and track. The connect clock rides out bouncer build-out bursts instead of shedding; the warm
		 *  floor avoids TLS-handshake stampedes; the query clock budgets bouncer queueing, the role's 2 s the execution. */
		critical: {
			applicationName: "autumn-critical",
			maxConnections: criticalMax,
			minConnections: Math.min(10, criticalMax),
			connectTimeoutMs: production ? 15_000 : 30_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: production ? 15_000 : 30_000,
			statementTimeoutMs: ROLE_STATEMENT_TIMEOUT_MS,
		},
		/** Every other request-path query. One connection stays warm so a backup critical read never pays
		 *  cold bouncer and TLS setup inside check's 2 s deadline. */
		general: {
			applicationName: null,
			maxConnections: poolMax({
				envVar: "GENERAL_DB_POOL_MAX",
				fallback: production ? 14 : 10,
			}),
			minConnections: 1,
			connectTimeoutMs: production ? 5_000 : 30_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		/** Reads that may lag, and the outage fallback: short clocks because the primary is the fallback, and a
		 *  warm floor that keeps traffic-built connections for the Redis-outage moment. */
		replica: {
			applicationName: "autumn-replica",
			maxConnections: replicaMax,
			minConnections: Math.min(4, replicaMax),
			connectTimeoutMs: 3_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 5_000,
			statementTimeoutMs: null,
		},
		/** Dashboard aggregates that legitimately run for seconds, kept off the replica's outage-fallback lane. */
		replicaSlow: {
			applicationName: "autumn-replica-slow",
			maxConnections: poolMax({
				envVar: "REPLICA_SLOW_DB_POOL_MAX",
				fallback: 2,
			}),
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 60_000,
			statementTimeoutMs: null,
		},
		/** Usage events on Neon, through its pooled endpoint. */
		neonEvents: {
			applicationName: "autumn-neon-events",
			maxConnections: 5,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 10_000,
			statementTimeoutMs: null,
		},
		/** The SQS worker process. */
		worker: {
			applicationName: null,
			maxConnections: 40,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		/** The cron process; its jobs SET LOCAL this statement_timeout around their sweeps. */
		cron: {
			applicationName: null,
			maxConnections: 40,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: 300_000,
		},
		/** The cron process's pg_stat probes, on their own connections so a slow sweep can't starve them. */
		dbProbe: {
			applicationName: null,
			maxConnections: 2,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		/** The entitlement reset loop. */
		resetCron: {
			applicationName: null,
			maxConnections: 10,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		/** Migration chunks; their 75 s per-statement deadline is attached by the migration runner, not the pool. */
		migration: {
			applicationName: null,
			maxConnections: poolMax({
				envVar: "MIGRATION_DB_POOL_MAX",
				fallback: migrationCustomerConcurrency * 2,
			}),
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		/** The shadow replay operator's read-only hydration source. */
		replay: {
			applicationName: null,
			maxConnections: 4,
			minConnections: 0,
			connectTimeoutMs: 2_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 2_000,
			statementTimeoutMs: null,
		},
		/** Scripts, benches, test setup, and the OAuth callbacks (which still open one per request). */
		adHoc: {
			applicationName: null,
			maxConnections: production ? 70 : 10,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		/** One pool per balance worker; the flush SET LOCALs the role's statement_timeout so a slow flush fails and retries. */
		balanceWorker: {
			applicationName: "autumn-balance-worker",
			maxConnections: BALANCE_WORKER_DATABASE_POOL_SIZE,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 5_000,
			statementTimeoutMs: ROLE_STATEMENT_TIMEOUT_MS,
		},
		/** Herald's catalog misses; the cache answers nearly everything. */
		herald: {
			applicationName: "autumn-herald",
			maxConnections: 2,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 30_000,
			statementTimeoutMs: null,
		},
		/** Herald's usage-event inserts on the events database. */
		heraldEvents: {
			applicationName: "autumn-herald-events",
			maxConnections: 4,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 30_000,
			statementTimeoutMs: null,
		},
	} satisfies Record<string, PostgresPoolProfile>;
};

export type PostgresPools = ReturnType<typeof createPostgresPools>;
export type PostgresPoolName = keyof PostgresPools;
