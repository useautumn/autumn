import { sql } from "drizzle-orm";
import type { DrizzleCli } from "./initDrizzle";

export const CRON_STATEMENT_TIMEOUT_MS = 300_000;

/**
 * Runs `fn` with a per-statement timeout. Uses SET LOCAL inside a txn because a
 * pool-level statement_timeout fails startup (08P01) behind PgBouncer at :6432;
 * SET LOCAL is transaction-scoped so it is safe under transaction pooling.
 */
export const withStatementTimeout = async <T>(
	db: DrizzleCli,
	fn: (tx: DrizzleCli) => Promise<T>,
	timeoutMs: number = CRON_STATEMENT_TIMEOUT_MS,
): Promise<T> =>
	db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`),
		);
		return fn(tx as unknown as DrizzleCli);
	});
