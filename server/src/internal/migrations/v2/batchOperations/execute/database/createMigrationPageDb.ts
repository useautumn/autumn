import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryConfig, QueryResult } from "pg";
import { type DrizzleCli, normalizeDbExecute } from "@/db/initDrizzle.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../utils/batchMigrationExecutionConstants.js";
import { runMigrationTransaction } from "./runMigrationTransaction.js";

export const createMigrationPageDb = ({
	ctx,
	queryTimeoutMs = BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	maxAttempts = 2,
}: {
	ctx: { db: DrizzleCli };
	queryTimeoutMs?: number;
	maxAttempts?: number;
}) => {
	const pool = (ctx.db as DrizzleCli & { $client: Pool }).$client;
	const controller = new AbortController();
	const assertActive = () => controller.signal.throwIfAborted();
	const abort = (error = new Error("batch-migration: page database closed")) =>
		controller.abort(error);
	const transaction = <T>(run: (db: DrizzleCli) => Promise<T>) =>
		runMigrationTransaction({
			pool,
			signal: controller.signal,
			queryTimeoutMs,
			maxAttempts,
			run,
		});
	const query = (
		config: string | QueryConfig,
		values?: unknown[],
	): Promise<QueryResult> =>
		runMigrationTransaction({
			pool,
			signal: controller.signal,
			queryTimeoutMs,
			maxAttempts: 1,
			transaction: false,
			run: (db) =>
				(db as DrizzleCli & { $client: { query: typeof query } }).$client.query(
					config,
					values,
				),
		});
	const db = normalizeDbExecute(
		drizzle({ query } as Pool, { schema: schemas }),
	) as unknown as DrizzleCli;
	db.transaction = transaction as typeof db.transaction;
	return { db, abort, assertActive };
};
