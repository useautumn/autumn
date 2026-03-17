import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { otelConfig } from "../utils/otel/otelConfig.js";

/** Creates a Drizzle pool with the given configuration. */
export const initDrizzle = ({
	maxConnections = 10,
	replica = false,
	connectTimeout = 5,
}: {
	maxConnections?: number;
	replica?: boolean;
	/** Connect timeout in seconds */
	connectTimeout?: number;
} = {}) => {
	const dbUrl =
		(replica ? process.env.DATABASE_REPLICA_URL : process.env.DATABASE_URL) ??
		"";

	const client = postgres(dbUrl, {
		max: maxConnections,
		connect_timeout: connectTimeout,
	});

	const db = drizzle(client, { schema });

	if (otelConfig.drizzle) {
		instrumentDrizzleClient(db);
	}

	return { db, client };
};

// -- Critical pool: used by check, track, getOrCreateCustomer --
export const { db: dbCritical, client: clientCritical } = initDrizzle({
	connectTimeout: 2,
});

// -- General pool: used by all other endpoints --
export const { db: dbGeneral, client: clientGeneral } = initDrizzle({
	connectTimeout: 5,
});

// -- Replica pool: used as fallback when primary is degraded --
// Only created if DATABASE_REPLICA_URL is configured.
const replicaResult = process.env.DATABASE_REPLICA_URL
	? initDrizzle({ replica: true, maxConnections: 5, connectTimeout: 2 })
	: null;
export const dbReplica = replicaResult?.db ?? null;
export const clientReplica = replicaResult?.client ?? null;

// Backward-compatible exports — existing code that imports `db` or `client`
// gets the general pool automatically.
export const client = clientGeneral;
export const db = dbGeneral;

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
