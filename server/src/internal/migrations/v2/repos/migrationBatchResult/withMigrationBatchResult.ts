import { migrationBatchResults } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { MigrationBatchResultStorage } from "../../batchOperations/execute/recovery/types/migrationBatchResultStorage.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../../batchOperations/execute/utils/batchMigrationExecutionConstants.js";

// Owns one SQL transaction: execute normally, or atomically save/reuse its result.
export const withMigrationBatchResult = async <
	Result extends Record<string, unknown>,
	Stored extends Record<string, unknown> = Result,
>({
	ctx,
	recovery,
	execute,
	forceCustomPlan = false,
}: {
	ctx: { db: DrizzleCli };
	recovery?: {
		orgId: string;
		env: string;
		batchId: string;
		input: Record<string, unknown>;
		resultStorage?: MigrationBatchResultStorage<Result, Stored>;
	};
	execute: (args: { ctx: { db: DrizzleCli } }) => Promise<Result>;
	forceCustomPlan?: boolean;
}): Promise<Result> =>
	withStatementTimeout(
		ctx.db,
		async (transaction) => {
			if (!recovery) return execute({ ctx: { db: transaction } });
			const serializedInput = JSON.stringify(recovery.input);
			const identity = and(
				eq(migrationBatchResults.org_id, recovery.orgId),
				eq(migrationBatchResults.env, recovery.env),
				eq(migrationBatchResults.batch_id, recovery.batchId),
			);
			const inserted = await transaction
				.insert(migrationBatchResults)
				.values({
					org_id: recovery.orgId,
					env: recovery.env,
					batch_id: recovery.batchId,
					version: recovery.resultStorage ? 2 : 1,
					input: JSON.parse(serializedInput),
					created_at: Date.now(),
				})
				.onConflictDoNothing()
				.returning({ id: migrationBatchResults.batch_id });

			if (inserted.length === 0) {
				// A separate statement sees the winner's commit after a conflicting insert waits.
				const [saved] = await transaction
					.select({
						version: migrationBatchResults.version,
						result: migrationBatchResults.result,
						matchesInput: sql<boolean>`${migrationBatchResults.input} = ${serializedInput}::jsonb`,
					})
					.from(migrationBatchResults)
					.where(identity);
				if (!saved || saved.result === null)
					throw new Error("Missing or unsupported migration batch result");
				if (!saved.matchesInput)
					throw new Error(
						"Migration batch identity reused with different input",
					);
				// Version 1 holds the full result written before compact storage was introduced.
				if (saved.version === 1) return saved.result as Result;
				if (saved.version === 2 && recovery.resultStorage)
					return recovery.resultStorage.fromStored({
						result: saved.result as Stored,
					});
				throw new Error("Missing or unsupported migration batch result");
			}

			const applied = await execute({ ctx: { db: transaction } });
			const stored = recovery.resultStorage
				? recovery.resultStorage.toStored({ result: applied })
				: applied;
			await transaction
				.update(migrationBatchResults)
				.set({ result: stored })
				.where(identity);
			return applied;
		},
		BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
		{ forceCustomPlan },
	);
