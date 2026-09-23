import { getHeraldEnv } from "@autumn/env/herald";
import { createPostgresClient, type PostgresClient } from "@autumn/postgres";

/** Catalog misses only so far; the cache answers nearly every record, so a small pool is enough. */
const DATABASE_POOL_SIZE = 2;

let postgres: PostgresClient | undefined;

/** The main database, beside the events one. */
export function getPostgres(): PostgresClient {
	postgres ??= createPostgresClient({
		config: {
			databaseUrl: getHeraldEnv().HERALD_DATABASE_URL,
			maxConnections: DATABASE_POOL_SIZE,
			connectTimeout: 10,
			idleTimeout: 30,
			maxLifetime: 1800,
		},
	});
	return postgres;
}
