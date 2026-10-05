import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { type DrizzleCli, normalizeDbExecute } from "@/db/initDrizzle.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../utils/batchMigrationExecutionConstants.js";
import {
	type MigrationQuery,
	runMigrationTransaction,
} from "./runMigrationTransaction.js";

export type MigrationPageDb = ReturnType<typeof createMigrationPageDb>;

const queryToDb = (query: MigrationQuery) =>
	normalizeDbExecute(
		drizzle({ query } as unknown as PoolClient, { schema: schemas }),
	) as unknown as DrizzleCli;

/** A page's database: every statement, standalone or not, runs in an owned
 * transaction, so `abort` fences the page before anything can commit late. */
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

	const transaction = <T>(run: (db: DrizzleCli) => Promise<T>) =>
		runMigrationTransaction({
			pool,
			signal: controller.signal,
			queryTimeoutMs,
			maxAttempts,
			run: (query) => run(queryToDb(query)),
		});

	const standaloneQuery: MigrationQuery = (config, values) =>
		runMigrationTransaction({
			pool,
			signal: controller.signal,
			queryTimeoutMs,
			maxAttempts,
			run: (query) => query(config, values),
		});

	const db = queryToDb(standaloneQuery);
	db.transaction = transaction as unknown as DrizzleCli["transaction"];

	return {
		db,
		abort: (
			error: unknown = new Error("batch-migration: page database closed"),
		) => controller.abort(error),
		assertActive: () => controller.signal.throwIfAborted(),
	};
};
