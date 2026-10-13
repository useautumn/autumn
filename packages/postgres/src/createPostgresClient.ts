import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { attachPoolErrorHandlers } from "./common/attachPoolErrorHandlers.js";
import type { PostgresPoolProfile } from "./pools/types/postgresPoolProfile.js";
import type {
	PostgresClient,
	PostgresClientConfig,
	PostgresLogger,
} from "./types/postgresClient.js";

/** pg's PoolConfig for a profile; unnamed pools leave application_name to the connection string. */
export const poolConfigOf = ({
	config,
}: {
	config: PostgresPoolProfile & { databaseUrl: string };
}): PoolConfig => ({
	connectionString: config.databaseUrl,
	application_name: config.applicationName ?? undefined,
	max: config.maxConnections,
	min: config.minConnections,
	connectionTimeoutMillis: config.connectTimeoutMs,
	idleTimeoutMillis: config.idleTimeoutMs,
	query_timeout: config.queryTimeoutMs ?? undefined,
});

export const createPostgresClient = ({
	ctx,
	config,
}: {
	ctx: { logger?: PostgresLogger };
	config: PostgresClientConfig;
}): PostgresClient => {
	const client = new pg.Pool(poolConfigOf({ config }));
	attachPoolErrorHandlers({ ctx, pool: client, name: config.applicationName });
	const db = drizzle(client, { schema: schemas });

	return { db, client, close: () => client.end() };
};
