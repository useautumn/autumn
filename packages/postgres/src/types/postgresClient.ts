import type { schemas } from "@autumn/shared";
import type { SQL as DrizzleSql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryResult } from "pg";
import type { PostgresPoolProfile } from "../pools/types/postgresPoolProfile.js";

export type PostgresDb = ReturnType<typeof drizzle<typeof schemas, Pool>>;

export type PostgresExecutor = {
	execute(query: DrizzleSql): Promise<Pick<QueryResult, "rows">>;
};

export type PostgresContext = {
	db: PostgresExecutor;
	orgId: string;
	env: string;
};

export type PostgresLogger = {
	warn: (message: string, fields: Record<string, unknown>) => void;
};

export type PostgresClient = {
	db: PostgresDb;
	client: Pool;
	close(): Promise<void>;
};

export type PostgresClientConfig = PostgresPoolProfile & {
	databaseUrl: string;
	applicationName: string;
};
