import type { SQL } from "drizzle-orm";

export type PostgresDb = {
	execute: (query: SQL) => Promise<Record<string, unknown>[]>;
};
