import { BALANCE_WORKER_DATABASE_POOL_SIZE } from "@autumn/env/balanceWorkerConstants";
import type { PostgresPoolProfile } from "./types/postgresPoolProfile.js";

type RuntimeEnv = Record<string, string | undefined>;

const positiveInt = (value: string | undefined): number | undefined => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const ROLE_STATEMENT_TIMEOUT_MS = 2_000;

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
	const migrationCustomerConcurrency =
		positiveInt(runtimeEnv.MIGRATION_RUN_CUSTOMER_CONCURRENCY) ?? 50;

	return {
		critical: {
			applicationName: "autumn-critical",
			maxConnections: criticalMax,
			minConnections: Math.min(10, criticalMax),
			connectTimeoutMs: production ? 15_000 : 30_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: production ? 15_000 : 30_000,
			statementTimeoutMs: ROLE_STATEMENT_TIMEOUT_MS,
		},
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
		list: {
			applicationName: "autumn-list",
			maxConnections: 4,
			minConnections: 0,
			connectTimeoutMs: production ? 5_000 : 30_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 10_000,
			statementTimeoutMs: null,
		},
		replica: {
			applicationName: "autumn-replica",
			maxConnections: replicaMax,
			minConnections: Math.min(4, replicaMax),
			connectTimeoutMs: 3_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 5_000,
			statementTimeoutMs: null,
		},
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
		neonEvents: {
			applicationName: "autumn-neon-events",
			maxConnections: 5,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 10_000,
			statementTimeoutMs: null,
		},
		worker: {
			applicationName: null,
			maxConnections: 40,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		cron: {
			applicationName: null,
			maxConnections: 40,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: 300_000,
		},
		dbProbe: {
			applicationName: null,
			maxConnections: 2,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		resetCron: {
			applicationName: null,
			maxConnections: 10,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
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
		replay: {
			applicationName: null,
			maxConnections: 4,
			minConnections: 0,
			connectTimeoutMs: 2_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 2_000,
			statementTimeoutMs: null,
		},
		adHoc: {
			applicationName: null,
			maxConnections: production ? 70 : 10,
			minConnections: 0,
			connectTimeoutMs: 5_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: null,
			statementTimeoutMs: null,
		},
		balanceWorker: {
			applicationName: "autumn-balance-worker",
			maxConnections: BALANCE_WORKER_DATABASE_POOL_SIZE,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 5_000,
			statementTimeoutMs: ROLE_STATEMENT_TIMEOUT_MS,
		},
		herald: {
			applicationName: "autumn-herald",
			maxConnections: 2,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 30_000,
			statementTimeoutMs: null,
		},
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
