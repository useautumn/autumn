import { schemas } from "@autumn/shared";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import type {
	PostgresClient,
	PostgresClientConfig,
} from "./types/postgresClient.js";

export const createPostgresClient = ({
	config,
}: {
	config: PostgresClientConfig;
}): PostgresClient => {
	const client = new SQL(config.databaseUrl, {
		max: config.maxConnections,
		connectionTimeout: config.connectTimeout,
		idleTimeout: config.idleTimeout,
		maxLifetime: config.maxLifetime,
	});
	const db = drizzle({ client, schema: schemas });

	return { db, client, close: () => client.close() };
};
