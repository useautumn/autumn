import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const DEFAULT_MAX_CONNECTIONS = 10;
const IDLE_TIMEOUT_MS = 30_000;

export const createPostgresDb = ({
	databaseUrl,
	maxConnections = DEFAULT_MAX_CONNECTIONS,
	name,
}: {
	databaseUrl: string;
	maxConnections?: number;
	name?: string;
}) => {
	const client = new pg.Pool({
		connectionString: databaseUrl,
		application_name: name,
		keepAlive: true,
		idleTimeoutMillis: IDLE_TIMEOUT_MS,
		max: maxConnections,
	});

	return { db: drizzle(client, { schema: schemas }), client };
};

export type PostgresDb = ReturnType<typeof createPostgresDb>["db"];
