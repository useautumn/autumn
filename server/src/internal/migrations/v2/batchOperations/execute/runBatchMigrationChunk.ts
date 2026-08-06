import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	MigrationRunControls,
	MigrationWebhookControls,
} from "@/internal/migrations/v2/cloudAdapter/types.js";
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
import { createDeferredSideEffects } from "./utils/deferredSideEffects.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";

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
	webhooks,
	controls,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	afterInternalId?: string;
	maxPages?: number;
	webhooks?: MigrationWebhookControls;
	controls?: MigrationRunControls;
}): Promise<BatchMigrationChunkResult> => {
	const migrationInternalId = getMigrationEventInternalId(migration);
	const chunkPhases: BatchMigrationPagePhases = {};
	const summary = {
		pages: 0,
		succeeded: 0,
		skipped: 0,
		phases: chunkPhases,
	};
	let cursor: string | null = afterInternalId ?? null;

	ctx.logger.info("batch-migration: chunk starting", {
		data: {
			migrationRunId,
			cursor,
			patches: plan.patches.length,
			maxPages,
		},
	});

	// Post-commit side effects run off the page's critical path and are drained
	// before the chunk returns.
	const deferredLogData = { migrationRunId };
	const events = createDeferredSideEffects({
		phase: "finalize_events_drain",
		phases: chunkPhases,
		logger: ctx.logger,
		logData: deferredLogData,
	});
	const caches = createDeferredSideEffects({
		phase: "finalize_caches_drain",
		phases: chunkPhases,
		logger: ctx.logger,
		logData: deferredLogData,
	});

	const finish = async (
		completion: BatchMigrationChunkResult["completion"],
	): Promise<BatchMigrationChunkResult> => {
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

	// A throw mid-loop must never orphan a pending cache invalidation — that is
	// silent, unrecoverable staleness — so the drain runs on every exit path.
	try {
		while (true) {
			if (await isMigrationCancelRequested({ migrationRunId }))
				return await finish("stopped");

			if (maxPages !== undefined && summary.pages >= maxPages)
				return await finish("slice_complete");

			if (summary.pages >= BATCH_MIGRATION_MAX_PAGES)
				throw new Error(
					`batch-migration: exceeded ${BATCH_MIGRATION_MAX_PAGES} pages — aborting run`,
				);

			const pagePhases: BatchMigrationPagePhases = {};
			const page = await claimNextBatchMigrationPage({
				ctx,
				migration,
				migrationInternalId,
				migrationRunId,
				afterInternalId: cursor ?? undefined,
				limit: BATCH_MIGRATION_PAGE_SIZE,
				controls,
				phases: pagePhases,
			});
			if (page.selectedCount === 0) return await finish("exhausted");
			cursor = page.cursor ?? cursor;

			if (page.customers.length === 0) continue;
			const pageResult = await executeBatchMigrationPage({
				ctx,
				migrationInternalId,
				migrationRunId,
				plan,
				customers: page.customers,
				phases: pagePhases,
			});
			await timePhase({
				phases: pagePhases,
				phase: "finalize",
				run: () =>
					finalizeBatchMigrationPage({
						ctx,
						migrationInternalId,
						migrationRunId,
						plan,
						pageResult,
						webhooks,
						phases: pagePhases,
						deferEvents: events.defer,
						deferCaches: caches.defer,
					}),
			});
			// Keep in-flight side effects bounded before starting the next page.
			await Promise.all([caches.settle(), events.settle()]);

			summary.pages += 1;
			summary.succeeded += pageResult.succeeded.length;
			summary.skipped += pageResult.skipped.length;
			for (const [phase, ms] of Object.entries(pagePhases)) {
				chunkPhases[phase] = (chunkPhases[phase] ?? 0) + ms;
			}
			ctx.logger.info("batch-migration: page executed", {
				data: {
					migrationRunId,
					page: summary.pages,
					succeeded: pageResult.succeeded.length,
					skipped: pageResult.skipped.length,
					...pagePhases,
				},
			});
		}
	} finally {
		await Promise.all([caches.drain(), events.drain()]);
	}
};
