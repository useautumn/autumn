import { schemas } from "@autumn/shared";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import type {
	PostgresClient,
	PostgresClientConfig,
} from "./types/postgresClient.js";

export const sqlOptionsOf = ({ config }: { config: PostgresClientConfig }) => ({
	max: config.maxConnections,
	prepare: config.usePreparedStatements ?? false,
	connectionTimeout: config.connectTimeout,
	idleTimeout: config.idleTimeout,
	maxLifetime: config.maxLifetime ?? 0,
	onconnect: config.onConnect,
	onclose: config.onClose,
});

export const createPostgresClient = ({
	config,
}: {
	config: PostgresClientConfig;
}): PostgresClient => {
	const client = new SQL(config.databaseUrl, sqlOptionsOf({ config }));
	const db = drizzle({ client, schema: schemas });

	return { db, client, close: () => client.close() };
};
