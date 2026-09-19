import type { schemas } from "@autumn/shared";
import type { SQL } from "bun";
import type { SQL as DrizzleSql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sql";

/** Drizzle over Bun's SQL driver; `execute` returns rows directly, no normalising wrapper. */
export type PostgresDb = ReturnType<typeof drizzle<typeof schemas>>;

/** What a repo runs against: the pool, a transaction opened on it, or a test double. */
export type PostgresExecutor = {
	execute(query: DrizzleSql): Promise<Record<string, unknown>[]>;
};

/** What every repo takes as `ctx`: the pool plus the tenant its query is scoped to. */
export type PostgresContext = {
	db: PostgresExecutor;
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
	/** Off by default because every deployed connection goes through PgBouncer in
	 *  transaction pooling mode, where a statement prepared on one backend
	 *  connection is absent when the next query lands on another. That surfaces as
	 *  a missing-prepared-statement error naming the bouncer, and it poisons the
	 *  surrounding transaction. Only turn it on against a direct connection. */
	usePreparedStatements?: boolean;
};
