import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

import type { SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { logger } from "../external/logtail/logtailUtils.js";
import { getServerForkCount } from "../utils/memory/forkRecycling/recyclePolicy.js";
import { otelConfig } from "../utils/otel/otelConfig.js";
import { applyConnectRefusedRetry } from "./connectRetry.js";
import { attachPoolErrorHandlers, registerPool } from "./pgPoolMonitor.js";

type AutumnDb = Omit<ReturnType<typeof drizzle<typeof schema>>, "execute"> & {
	execute: <TRow = Record<string, unknown>>(
		query: string | SQLWrapper,
	) => Promise<TRow[]>;
};

const normalizeExecuteRows = <TRow>(result: unknown): TRow[] => {
	if (result && typeof result === "object" && "rows" in result) {
		return (result as { rows: TRow[] }).rows;
	}

	return result as TRow[];
};

const normalizeDbExecute = <
	TDb extends { execute: (query: string | SQLWrapper) => Promise<unknown> },
>(
	db: TDb,
) => {
	const execute = db.execute.bind(db);
	return Object.assign(db, {
		execute: async <TRow = Record<string, unknown>>(
			query: string | SQLWrapper,
		) => normalizeExecuteRows<TRow>(await execute(query)),
	});
};

/** Creates a Drizzle pool with the given configuration. */
export const initDrizzle = ({
	maxConnections = isProd ? 70 : 10,
	replica = false,
	connectTimeout = 5,
	databaseUrl,
	poolConfig,
	name,
}: {
	maxConnections?: number;
	replica?: boolean;
	/** Connect timeout in seconds */
	connectTimeout?: number | null;
	databaseUrl?: string;
	poolConfig?: PoolConfig;
	/** Pool name for monitor/error logs. Omit to skip registration. */
	name?: string;
} = {}) => {
	const envDbUrl = replica
		? process.env.DATABASE_REPLICA_URL
		: process.env.DATABASE_URL;

	const dbUrl = databaseUrl || envDbUrl || "";

	const client = new pg.Pool({
		connectionString: dbUrl,
		keepAlive: true,
		idleTimeoutMillis: 30_000,
		...poolConfig,
		max: maxConnections,
		connectionTimeoutMillis:
			connectTimeout === null ? undefined : connectTimeout * 1000,
	});

	if (name) {
		attachPoolErrorHandlers({ pool: client, name });
		registerPool({ pool: client, name, max: maxConnections });
	}
	// After registerPool so a retry passes through timeAcquires as its own acquire attempt.
	applyConnectRefusedRetry({ pool: client, name: name ?? "unnamed" });

	const drizzleDb = drizzle(client, { schema });
	const transaction = drizzleDb.transaction.bind(drizzleDb);
	const db = normalizeDbExecute(drizzleDb) as unknown as AutumnDb;
	const normalizedTransaction: typeof drizzleDb.transaction = ((fn, config) =>
		transaction(
			(tx) => fn(normalizeDbExecute(tx) as typeof tx),
			config,
		)) as typeof drizzleDb.transaction;
	db.transaction = normalizedTransaction as typeof db.transaction;

	if (otelConfig.drizzle) {
		instrumentDrizzleClient(db);
	}

	return { db, client };
};

// Strict latency limits in prod; relaxed locally so dev pool warm-up doesn't kill tests.
const isProd = process.env.NODE_ENV === "production";

const poolMaxFromEnv = ({
	envVar,
	fallback,
}: {
	envVar: string;
	fallback: number;
}): number => {
	const parsed = Number(process.env[envVar]);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** Frontend ceiling the app's primary pools actually compete for: PgBouncer
 *  max_client_conn (2,000) x 6 pods. */
const PGBOUNCER_MAX_CLIENT_CONN = 12_000;

/** The replica pool connects through its own dedicated bouncer (single
 *  instance), so it has its own client-slot budget separate from the primary's. */
const REPLICA_PGBOUNCER_MAX_CLIENT_CONN = 1_000;

/** Bouncer->Postgres slots. NOT a client limit — transaction pooling multiplexes
 *  many clients onto far fewer of these. Kept for sizing, not for this guard. */
const POSTGRES_MAX_SERVER_CONNECTIONS = 7_600;

/** 20 pinned tasks x forks. Recycles transiently add +1 fork/task — headroom
 *  absorbs that at <=4 forks; at 5+ also lower REPLICA_DB_POOL_MAX. */
const BUDGETED_FLEET_PROCESSES = 20 * getServerForkCount();

/** Dedicated worker/cron pools that exist outside the three exported ones. */
const BUDGETED_NON_SERVER_CONNECTIONS = 362;
const POOL_BUDGET_HEADROOM = 0.85;

const PROD_POOL_MAX = {
	critical: 22,
	general: 14,
	// 90 processes x 9 = 810 <= 0.85 x replica bouncer max_client_conn (1,000).
	replica: 9,
};

const criticalPoolMax = poolMaxFromEnv({
	envVar: "CRITICAL_DB_POOL_MAX",
	fallback: isProd ? PROD_POOL_MAX.critical : 10,
});
const generalPoolMax = poolMaxFromEnv({
	envVar: "GENERAL_DB_POOL_MAX",
	fallback: isProd ? PROD_POOL_MAX.general : 10,
});
const replicaPoolMax = poolMaxFromEnv({
	envVar: "REPLICA_DB_POOL_MAX",
	fallback: PROD_POOL_MAX.replica,
});

/** Fleet budget guards. Primary pools count against the primary bouncer's
 *  max_client_conn; the replica pool counts against the replica bouncer's. */
export const computePoolBudgetWarnings = ({
	criticalPoolMax: critical,
	generalPoolMax: general,
	replicaPoolMax: replica,
	fleetProcesses = BUDGETED_FLEET_PROCESSES,
}: {
	criticalPoolMax: number;
	generalPoolMax: number;
	replicaPoolMax: number;
	fleetProcesses?: number;
}): string[] => {
	const warnings: string[] = [];

	const primaryFleetConnections =
		fleetProcesses * (critical + general) + BUDGETED_NON_SERVER_CONNECTIONS;
	if (
		primaryFleetConnections >
		PGBOUNCER_MAX_CLIENT_CONN * POOL_BUDGET_HEADROOM
	) {
		warnings.push(
			`[initDrizzle] primary pool budget (${primaryFleetConnections}) exceeds ${POOL_BUDGET_HEADROOM} of primary PgBouncer max_client_conn (${PGBOUNCER_MAX_CLIENT_CONN}) — lower the pool maxes or raise the ceiling. Postgres server slots (${POSTGRES_MAX_SERVER_CONNECTIONS}) are a separate, larger budget and are not the constraint here.`,
		);
	}

	const replicaFleetConnections = fleetProcesses * replica;
	if (
		replicaFleetConnections >
		REPLICA_PGBOUNCER_MAX_CLIENT_CONN * POOL_BUDGET_HEADROOM
	) {
		warnings.push(
			`[initDrizzle] replica pool budget (${replicaFleetConnections}) exceeds ${POOL_BUDGET_HEADROOM} of replica PgBouncer max_client_conn (${REPLICA_PGBOUNCER_MAX_CLIENT_CONN}) — lower REPLICA_DB_POOL_MAX or raise the ceiling.`,
		);
	}

	return warnings;
};

for (const warning of computePoolBudgetWarnings({
	criticalPoolMax,
	generalPoolMax,
	replicaPoolMax,
})) {
	logger.warn(warning);
}

export const { db: dbCritical, client: clientCritical } = initDrizzle({
	name: "critical",
	maxConnections: criticalPoolMax,
	// connectionTimeoutMillis also bounds checkout waits on a full pool — sized
	// to ride out PgBouncer backend build-out bursts instead of shedding.
	connectTimeout: isProd ? 15 : 30,
	databaseUrl: process.env.DATABASE_CRITICAL_URL,
	poolConfig: {
		application_name: "autumn-critical",
		// Budgets bouncer queue wait, not execution: the role's server-side 2s
		// statement_timeout still kills runaway queries once they start running.
		query_timeout: isProd ? 15_000 : 30_000,
		// Keep warm conns to avoid TLS-handshake stampedes on bursty traffic.
		min: Math.min(10, criticalPoolMax),
	},
});

// -- General pool: used by all other endpoints --
export const { db: dbGeneral, client: clientGeneral } = initDrizzle({
	name: "general",
	maxConnections: generalPoolMax,
	connectTimeout: isProd ? 5 : 30,
});

// -- Replica pool: used as fallback when primary is degraded --
// Only created if DATABASE_REPLICA_URL is configured.
const replicaResult = process.env.DATABASE_REPLICA_URL
	? initDrizzle({
			name: "replica",
			replica: true,
			maxConnections: replicaPoolMax,
			// Primary is always the fallback, so short beats patient here.
			connectTimeout: 3,
			poolConfig: {
				application_name: "autumn-replica",
				// Bounds replica-bouncer queue wait as well as execution.
				query_timeout: 5_000,
				// pg-pool's min doesn't precreate, it only exempts from idle reaping — the
				// floor preserves traffic-built warmth (e.g. a 1x warm-up) for the Redis-outage moment.
				min: Math.min(4, replicaPoolMax),
			},
		})
	: null;
export const dbReplica = replicaResult?.db ?? null;
export const clientReplica = replicaResult?.client ?? null;

// Backward-compatible exports — existing code that imports `db` or `client`
// gets the general pool automatically.
export const client = clientGeneral;
export const db = dbGeneral;

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
