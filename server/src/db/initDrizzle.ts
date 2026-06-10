import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

import type { SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { logger } from "../external/logtail/logtailUtils.js";
import { otelConfig } from "../utils/otel/otelConfig.js";
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

const PGBOUNCER_MAX_CLIENT_CONN = 7_600;
const BUDGETED_FLEET_PROCESSES = 150;
const BUDGETED_NON_SERVER_CONNECTIONS = 80;
const POOL_BUDGET_HEADROOM = 0.85;

const PROD_POOL_MAX = {
	critical: 22,
	general: 14,
	replica: 6,
};

const budgetedFleetConnections =
	BUDGETED_FLEET_PROCESSES *
		(PROD_POOL_MAX.critical + PROD_POOL_MAX.general + PROD_POOL_MAX.replica) +
	BUDGETED_NON_SERVER_CONNECTIONS;

if (
	budgetedFleetConnections >
	PGBOUNCER_MAX_CLIENT_CONN * POOL_BUDGET_HEADROOM
) {
	logger.warn(
		`[initDrizzle] pool budget (${budgetedFleetConnections}) exceeds ${POOL_BUDGET_HEADROOM} of max_client_conn (${PGBOUNCER_MAX_CLIENT_CONN}) — resize PROD_POOL_MAX`,
	);
}

const criticalPoolMax = poolMaxFromEnv({
	envVar: "CRITICAL_DB_POOL_MAX",
	fallback: isProd ? PROD_POOL_MAX.critical : 10,
});

export const { db: dbCritical, client: clientCritical } = initDrizzle({
	name: "critical",
	maxConnections: criticalPoolMax,
	connectTimeout: isProd ? 2 : 30,
	databaseUrl: process.env.DATABASE_CRITICAL_URL,
	poolConfig: {
		application_name: "autumn-critical",
		query_timeout: isProd ? 2_000 : 30_000,
		// Keep warm conns to avoid TLS-handshake stampedes on bursty traffic.
		min: Math.min(10, criticalPoolMax),
	},
});

// -- General pool: used by all other endpoints --
export const { db: dbGeneral, client: clientGeneral } = initDrizzle({
	name: "general",
	maxConnections: poolMaxFromEnv({
		envVar: "GENERAL_DB_POOL_MAX",
		fallback: isProd ? PROD_POOL_MAX.general : 10,
	}),
	connectTimeout: isProd ? 5 : 30,
});

// -- Replica pool: used as fallback when primary is degraded --
// Only created if DATABASE_REPLICA_URL is configured.
const replicaResult = process.env.DATABASE_REPLICA_URL
	? initDrizzle({
			name: "replica",
			replica: true,
			maxConnections: poolMaxFromEnv({
				envVar: "REPLICA_DB_POOL_MAX",
				fallback: PROD_POOL_MAX.replica,
			}),
			connectTimeout: null,
		})
	: null;
export const dbReplica = replicaResult?.db ?? null;
export const clientReplica = replicaResult?.client ?? null;

// Backward-compatible exports — existing code that imports `db` or `client`
// gets the general pool automatically.
export const client = clientGeneral;
export const db = dbGeneral;

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
