import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import type { PostgresDb } from "../types/postgresClient.js";
import { isPostgresConnectionFailure } from "./postgresErrors.js";

type PostgresTransaction = Parameters<Parameters<PostgresDb["transaction"]>[0]>[0];

/**
 * Drizzle's transaction on a pool hands its client back even after a read timeout, still holding the hung query that
 * fails whoever checks it out next. Here that client leaves the pool; its rollback waits one more query timeout first.
 */
export const runInTransaction = async <Value>({
	ctx,
	run,
	config,
}: {
	ctx: { db: Pick<PostgresDb, "$client" | "_"> };
	run: (tx: PostgresTransaction) => Promise<Value>;
	config?: PgTransactionConfig;
}): Promise<Value> => {
	const client = await ctx.db.$client.connect();
	let connectionFailed = false;
	try {
		return await drizzle(client, { schema: ctx.db._.fullSchema }).transaction(
			run,
			config,
		);
	} catch (error) {
		connectionFailed = isPostgresConnectionFailure({ error });
		throw error;
	} finally {
		client.release(connectionFailed);
	}
};
