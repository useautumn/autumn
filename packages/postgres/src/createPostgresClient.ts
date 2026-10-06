import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { attachPoolErrorHandlers } from "./common/attachPoolErrorHandlers.js";
import type {
	PostgresClient,
	PostgresClientConfig,
	PostgresLogger,
} from "./types/postgresClient.js";

export const poolConfigOf = ({
	config,
}: {
	config: PostgresClientConfig;
}): PoolConfig => ({
	connectionString: config.databaseUrl,
	application_name: config.applicationName,
	max: config.maxConnections,
	connectionTimeoutMillis: config.connectTimeout * 1000,
	idleTimeoutMillis: config.idleTimeout * 1000,
	query_timeout: config.queryTimeout * 1000,
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
