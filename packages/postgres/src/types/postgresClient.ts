import type { schemas } from "@autumn/shared";
import type { SQL as DrizzleSql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryResult } from "pg";

/** Drizzle over a node-postgres pool; `execute` answers pg's `QueryResult`, rows on `.rows`. */
export type PostgresDb = ReturnType<typeof drizzle<typeof schemas, Pool>>;

/** What a repo runs against: the pool, a transaction opened on it, or a test double. */
export type PostgresExecutor = {
	execute(query: DrizzleSql): Promise<Pick<QueryResult, "rows">>;
};

/** What every repo takes as `ctx`: the pool plus the tenant its query is scoped to. */
export type PostgresContext = {
	db: PostgresExecutor;
	orgId: string;
	env: string;
};

/** The one call the pool makes; any app logger satisfies it. */
export type PostgresLogger = {
	warn: (message: string, fields: Record<string, unknown>) => void;
};

export type PostgresClient = {
	db: PostgresDb;
	client: Pool;
	close(): Promise<void>;
};

export type PostgresClientConfig = {
	databaseUrl: string;
	/** Names the pool's connections in pg_stat_activity and the bouncer's logs. */
	applicationName: string;
	/** Pool ceiling; counts against the PgBouncer max_client_conn budget per process. */
	maxConnections: number;
	/** Seconds to wait for a connection, whether opening one or queued on a full pool. */
	connectTimeout: number;
	/** Seconds an idle connection stays open. */
	idleTimeout: number;
	/** Seconds a query may wait for its answer: the client's read deadline, since a statement that never reached
	 *  Postgres can't hit its statement_timeout. */
	queryTimeout: number;
};
