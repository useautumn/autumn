import { getPostgresPools } from "@autumn/postgres";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "./initDrizzle";

export const withStatementTimeout = async <T>(
	db: DrizzleCli,
	fn: (tx: DrizzleCli) => Promise<T>,
	timeoutMs: number = getPostgresPools().cron.statementTimeoutMs,
	options?: { forceCustomPlan?: boolean },
): Promise<T> =>
	db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`),
		);
		if (options?.forceCustomPlan) {
			await tx.execute(
				sql.raw("SET LOCAL plan_cache_mode = force_custom_plan"),
			);
		}
		return fn(tx as unknown as DrizzleCli);
	});
