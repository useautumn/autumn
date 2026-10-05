import { drizzle } from "drizzle-orm/node-postgres";
import type { PostgresDb, PostgresExecutor } from "../types/postgresClient.js";
import { isPostgresConnectionFailure } from "./postgresErrors.js";

/**
 * Drizzle's transaction on a pool hands its client back even after a read timeout, still holding the hung query that
 * fails whoever checks it out next. Here that client leaves the pool; its rollback waits one more query timeout first.
 */
export const runInTransaction = async <Value>({
	ctx,
	run,
}: {
	ctx: { db: Pick<PostgresDb, "$client"> };
	run: (tx: PostgresExecutor) => Promise<Value>;
}): Promise<Value> => {
	const client = await ctx.db.$client.connect();
	let connectionFailed = false;
	try {
		return await drizzle(client).transaction(run);
	} catch (error) {
		connectionFailed = isPostgresConnectionFailure({ error });
		throw error;
	} finally {
		client.release(connectionFailed);
	}
};
