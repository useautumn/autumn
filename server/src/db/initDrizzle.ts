import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

import type { SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { otelConfig } from "../utils/otel/otelConfig.js";

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
	maxConnections = 10,
	replica = false,
	connectTimeout = 5,
	poolConfig,
}: {
	maxConnections?: number;
	replica?: boolean;
	/** Connect timeout in seconds */
	connectTimeout?: number;
	poolConfig?: PoolConfig;
} = {}) => {
	const dbUrl =
		(replica ? process.env.DATABASE_REPLICA_URL : process.env.DATABASE_URL) ??
		"";

	const client = new pg.Pool({
		connectionString: dbUrl,
		...poolConfig,
		max: maxConnections,
		connectionTimeoutMillis:
			connectTimeout === undefined ? undefined : connectTimeout * 1000,
	});

	const drizzleDb = drizzle(client, { schema });
	const transaction = drizzleDb.transaction.bind(drizzleDb);
	const db = normalizeDbExecute(drizzleDb) as unknown as AutumnDb;
	const normalizedTransaction: typeof drizzleDb.transaction = ((
		fn,
		config,
	) =>
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

export const { db: dbCritical, client: clientCritical } = initDrizzle({
	maxConnections: 5,
	poolConfig: {
		application_name: "autumn-critical",
		query_timeout: 2_000,
	},
});

// -- General pool: used by all other endpoints --
export const { db: dbGeneral, client: clientGeneral } = initDrizzle({
	// connectTimeout: 5,
});

// -- Replica pool: used as fallback when primary is degraded --
// Only created if DATABASE_REPLICA_URL is configured.
const replicaResult = process.env.DATABASE_REPLICA_URL
	? initDrizzle({ replica: true, maxConnections: 5, connectTimeout: undefined })
	: null;
export const dbReplica = replicaResult?.db ?? null;
export const clientReplica = replicaResult?.client ?? null;

// Backward-compatible exports — existing code that imports `db` or `client`
// gets the general pool automatically.
export const client = clientGeneral;
export const db = dbGeneral;

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
