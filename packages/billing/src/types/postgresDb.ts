import type { SQL } from "drizzle-orm";

/** The one thing the meters need from Postgres: run a raw query, get rows. The runtime passes its replica. */
export type PostgresDb = {
	execute: (query: SQL) => Promise<Record<string, unknown>[]>;
};
