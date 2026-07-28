import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isMigrationCancelRequested } from "@/internal/migrations/v2/run/utils/migrationCancelToken.js";
import {
	getMigrationEventInternalId,
	type MigrationRuntimeWithEventId,
} from "@/internal/migrations/v2/types/migrationDefinition.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { claimNextBatchMigrationPage } from "./claim/index.js";
import { executeBatchMigrationPage } from "./executeBatchMigrationPage.js";
import { finalizeBatchMigrationPage } from "./finalize/finalizeBatchMigrationPage.js";
import type { BatchMigrationChunkResult } from "./types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_MAX_PAGES,
	BATCH_MIGRATION_PAGE_SIZE,
} from "./utils/batchMigrationExecutionConstants.js";

/**
 * Runs one batch chunk: pages from `afterInternalId` until the filter is
 * exhausted, the `maxPages` budget is hit (slice_complete + cursor resumes
 * from the next chunk), or cancel. Unbudgeted, it runs to exhaustion.
 */
export const runBatchMigrationChunk = async ({
	ctx,
	migration,
	migrationRunId,
	plan,
	afterInternalId,
	maxPages,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	afterInternalId?: string;
	maxPages?: number;
}): Promise<BatchMigrationChunkResult> => {
	const migrationInternalId = getMigrationEventInternalId(migration);
	const summary = { pages: 0, succeeded: 0, skipped: 0 };
	let cursor: string | null = afterInternalId ?? null;

	ctx.logger.info("batch-migration: chunk starting", {
		data: {
			migrationRunId,
			cursor,
			patches: plan.patches.length,
			maxPages,
		},
	});

	const finish = (
		completion: BatchMigrationChunkResult["completion"],
	): BatchMigrationChunkResult => {
		ctx.logger.info("batch-migration: chunk finished", {
			data: { migrationRunId, completion, cursor, ...summary },
		});
		return {
			processed: summary.succeeded + summary.skipped,
			completion,
			cursor,
			summary,
		};
	};

	while (true) {
		if (await isMigrationCancelRequested({ migrationRunId }))
			return finish("stopped");

		if (maxPages !== undefined && summary.pages >= maxPages)
			return finish("slice_complete");

		if (summary.pages >= BATCH_MIGRATION_MAX_PAGES)
			throw new Error(
				`batch-migration: exceeded ${BATCH_MIGRATION_MAX_PAGES} pages — aborting run`,
			);

		const page = await claimNextBatchMigrationPage({
			ctx,
			migration,
			migrationInternalId,
			migrationRunId,
			afterInternalId: cursor ?? undefined,
			limit: BATCH_MIGRATION_PAGE_SIZE,
		});
		if (page.selectedCount === 0) return finish("exhausted");
		cursor = page.cursor ?? cursor;

		if (page.customers.length === 0) continue;
		const pageResult = await executeBatchMigrationPage({
			ctx,
			migrationInternalId,
			plan,
			customers: page.customers,
		});
		await finalizeBatchMigrationPage({
			ctx,
			migrationInternalId,
			migrationRunId,
			pageResult,
		});
		summary.pages += 1;
		summary.succeeded += pageResult.succeeded.length;
		summary.skipped += pageResult.skipped.length;
	}
};
