import type { schemas } from "@autumn/shared";
import type { SQL as DrizzleSql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryResult } from "pg";
import type { PostgresPoolProfile } from "../pools/types/postgresPoolProfile.js";

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

/** A pool profile bound to its database; pools opened here are always named. */
export type PostgresClientConfig = PostgresPoolProfile & {
	databaseUrl: string;
	applicationName: string;
};
