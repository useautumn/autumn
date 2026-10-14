import { createDatabaseEnv } from "@autumn/env/database";
import dotenv from "dotenv";

dotenv.config();

import {
	attachPoolErrorHandlers,
	getPostgresPools,
	type PostgresPoolProfile,
	poolConfigOf,
	runInTransaction,
} from "@autumn/postgres";
import { schemas as schema } from "@autumn/shared";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

import type { SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { logger } from "../external/logtail/logtailUtils.js";
import { getServerForkCount } from "../utils/memory/forkRecycling/recyclePolicy.js";
import { otelConfig } from "../utils/otel/otelConfig.js";
import { applyConnectRefusedRetry } from "./connectRetry.js";
import { getRole, registerPool } from "./pgPoolMonitor.js";

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

export const normalizeDbExecute = <
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

export const initDrizzle = ({
	pool = getPostgresPools().adHoc,
	maxConnections = pool.maxConnections,
	connectTimeout = pool.connectTimeoutMs / 1000,
	replica = false,
	databaseUrl,
	poolConfig,
	name,
}: {
	pool?: PostgresPoolProfile;
	maxConnections?: number;
	connectTimeout?: number;
	replica?: boolean;
	databaseUrl?: string;
	poolConfig?: PoolConfig;
	name?: string;
} = {}) => {
	const databaseEnv = createDatabaseEnv(process.env);
	const envDbUrl = replica
		? databaseEnv.DATABASE_REPLICA_URL
		: databaseEnv.DATABASE_URL;

	const dbUrl = databaseUrl || envDbUrl || "";

	const client = new pg.Pool({
		...poolConfigOf({
			config: {
				databaseUrl: dbUrl,
				...pool,
				maxConnections,
				connectTimeoutMs: connectTimeout * 1000,
			},
		}),
		keepAlive: true,
		keepAliveInitialDelayMillis: 60_000,
		...poolConfig,
	});

	if (name) {
		attachPoolErrorHandlers({
			ctx: { logger: logger.child({ context: { role: getRole() } }) },
			pool: client,
			name,
		});
		registerPool({ pool: client, name, max: maxConnections });
	}
	applyConnectRefusedRetry({ pool: client, name: name ?? "unnamed" });

	const drizzleDb = drizzle(client, { schema });
	const db = normalizeDbExecute(drizzleDb) as unknown as AutumnDb;
	const normalizedTransaction: typeof drizzleDb.transaction = ((fn, config) =>
		runInTransaction({
			ctx: { db: drizzleDb },
			run: (tx) => fn(normalizeDbExecute(tx) as typeof tx),
			config,
		})) as typeof drizzleDb.transaction;
	db.transaction = normalizedTransaction as typeof db.transaction;

	if (otelConfig.drizzle) {
		instrumentDrizzleClient(db);
	}

	return { db, client };
};

const pools = getPostgresPools();

const PGBOUNCER_MAX_CLIENT_CONN = 12_000;

const REPLICA_PGBOUNCER_MAX_CLIENT_CONN = 1_000;

/** Bouncer->Postgres slots. NOT a client limit — transaction pooling multiplexes
 *  many clients onto far fewer of these. Kept for sizing, not for this guard. */
const POSTGRES_MAX_SERVER_CONNECTIONS = 7_600;

const BUDGETED_FLEET_PROCESSES = 20 * getServerForkCount();

const BUDGETED_NON_SERVER_CONNECTIONS = 362;
const POOL_BUDGET_HEADROOM = 0.85;

export const computePoolBudgetWarnings = ({
	criticalPoolMax: critical,
	generalPoolMax: general,
	listPoolMax: list,
	replicaPoolMax: replica,
	fleetProcesses = BUDGETED_FLEET_PROCESSES,
}: {
	criticalPoolMax: number;
	generalPoolMax: number;
	listPoolMax: number;
	replicaPoolMax: number;
	fleetProcesses?: number;
}): string[] => {
	const warnings: string[] = [];

	const primaryFleetConnections =
		fleetProcesses * (critical + general + list) +
		BUDGETED_NON_SERVER_CONNECTIONS;
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
	criticalPoolMax: pools.critical.maxConnections,
	generalPoolMax: pools.general.maxConnections,
	listPoolMax: pools.list.maxConnections,
	replicaPoolMax:
		pools.replica.maxConnections + pools.replicaSlow.maxConnections,
})) {
	logger.warn(warning);
}

export const { db: dbCritical, client: clientCritical } = initDrizzle({
	name: "critical",
	pool: pools.critical,
	databaseUrl: createDatabaseEnv(process.env).DATABASE_CRITICAL_URL,
});

export const { db: dbGeneral, client: clientGeneral } = initDrizzle({
	name: "general",
	pool: pools.general,
});

export const { db: dbList, client: clientList } = initDrizzle({
	name: "list",
	pool: pools.list,
});

const replicaResult = process.env.DATABASE_REPLICA_URL
	? initDrizzle({ name: "replica", replica: true, pool: pools.replica })
	: null;
export const dbReplica = replicaResult?.db ?? null;
export const clientReplica = replicaResult?.client ?? null;

const replicaSlowResult = process.env.DATABASE_REPLICA_URL
	? initDrizzle({
			name: "replica-slow",
			replica: true,
			pool: pools.replicaSlow,
		})
	: null;
export const dbReplicaSlow = replicaSlowResult?.db ?? null;
export const clientReplicaSlow = replicaSlowResult?.client ?? null;

export const client = clientGeneral;
export const db = dbGeneral;

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
