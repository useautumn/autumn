import { createPostgresDb, type PostgresDb } from "@autumn/postgres";
import { env } from "./env.js";

const MAX_CONNECTIONS = 4;

let postgres: PostgresDb | undefined;

export const getPostgres = (): PostgresDb => {
	postgres ??= createPostgresDb({
		databaseUrl: env.DATABASE_URL,
		maxConnections: MAX_CONNECTIONS,
		name: "ledger",
	}).db;
	return postgres;
};
