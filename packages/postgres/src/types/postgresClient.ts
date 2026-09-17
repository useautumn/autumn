import type { schemas } from "@autumn/shared";
import type { SQL } from "bun";
import type { drizzle } from "drizzle-orm/bun-sql";

/** Drizzle over Bun's SQL driver; `execute` returns rows directly, no normalising wrapper. */
export type PostgresDb = ReturnType<typeof drizzle<typeof schemas>>;

/** What every repo takes as `ctx`: the pool plus the tenant its query is scoped to. */
export type PostgresContext = {
	db: PostgresDb;
	orgId: string;
	env: string;
};

export type PostgresClient = {
	db: PostgresDb;
	client: SQL;
	close(): Promise<void>;
};

export type PostgresClientConfig = {
	databaseUrl: string;
	/** Pool ceiling; counts against the PgBouncer max_client_conn budget per process. */
	maxConnections: number;
	/** Seconds to wait when establishing a connection. */
	connectTimeout: number;
	/** Seconds an idle connection stays open. */
	idleTimeout: number;
	/** Seconds before a connection is recycled, so a failover never pins a stale socket. */
	maxLifetime: number;
};
