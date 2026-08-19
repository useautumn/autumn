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
import type {
	BatchMigrationChunkResult,
	BatchMigrationPageResult,
} from "./types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_MAX_PAGES,
	BATCH_MIGRATION_PAGE_SIZE,
	BATCH_MIGRATION_TRANSIENT_DB_PAGE_ATTEMPTS,
	BATCH_MIGRATION_TRANSIENT_DB_RETRY_DELAY_MS,
} from "./utils/batchMigrationExecutionConstants.js";
import { createDeferredSideEffects } from "./utils/deferredSideEffects.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";
import { runWithTransientDbRetry } from "./utils/runWithTransientDbRetry.js";

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

			const pageAfterInternalId = cursor ?? undefined;
			const outcome = await runWithTransientDbRetry({
				maxAttempts: BATCH_MIGRATION_TRANSIENT_DB_PAGE_ATTEMPTS,
				delayMs: BATCH_MIGRATION_TRANSIENT_DB_RETRY_DELAY_MS,
				onRetry: ({ error, attempt, maxAttempts }) => {
					ctx.logger.warn(
						"batch-migration: retrying page after transient db error",
						{
							data: {
								migrationRunId,
								cursor,
								attempt,
								maxAttempts,
								error:
									error instanceof Error ? error.message : String(error),
							},
						},
					);
				},
				run: () =>
					runNextBatchMigrationPage({
						ctx,
						migration,
						migrationInternalId,
						migrationRunId,
						plan,
						afterInternalId: pageAfterInternalId,
						controls,
						webhooks,
						eventsDefer: events.defer,
						cachesDefer: caches.defer,
						settle: () => Promise.all([caches.settle(), events.settle()]),
					}),
			});
			if (outcome.kind === "exhausted") return await finish("exhausted");
			cursor = outcome.cursor ?? cursor;
			if (outcome.kind === "advanced") continue;

			summary.pages += 1;
			summary.succeeded += outcome.pageResult.succeeded.length;
			summary.skipped += outcome.pageResult.skipped.length;
			for (const [phase, ms] of Object.entries(outcome.pagePhases)) {
				chunkPhases[phase] = (chunkPhases[phase] ?? 0) + ms;
			}
			ctx.logger.info("batch-migration: page executed", {
				data: {
					migrationRunId,
					page: summary.pages,
					succeeded: outcome.pageResult.succeeded.length,
					skipped: outcome.pageResult.skipped.length,
					...outcome.pagePhases,
				},
			});
		}
	} finally {
		await Promise.all([caches.drain(), events.drain()]);
	}
};

type NextPageOutcome =
	| { kind: "exhausted" }
	| { kind: "advanced"; cursor: string | null }
	| {
			kind: "executed";
			cursor: string | null;
			pageResult: BatchMigrationPageResult;
			pagePhases: BatchMigrationPagePhases;
	  };

/** One claim → execute → finalize. Cursor is only returned on success so a
 * retry restarts from the same keyset after a dropped socket. */
const runNextBatchMigrationPage = async ({
	ctx,
	migration,
	migrationInternalId,
	migrationRunId,
	plan,
	afterInternalId,
	controls,
	webhooks,
	eventsDefer,
	cachesDefer,
	settle,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	afterInternalId?: string;
	controls?: MigrationRunControls;
	webhooks?: MigrationWebhookControls;
	eventsDefer: (run: () => Promise<unknown>) => void;
	cachesDefer: (run: () => Promise<unknown>) => void;
	settle: () => Promise<unknown>;
}): Promise<NextPageOutcome> => {
	const pagePhases: BatchMigrationPagePhases = {};
	const page = await claimNextBatchMigrationPage({
		ctx,
		migration,
		migrationInternalId,
		migrationRunId,
		afterInternalId,
		limit: BATCH_MIGRATION_PAGE_SIZE,
		controls,
		phases: pagePhases,
	});
	if (page.selectedCount === 0) return { kind: "exhausted" };
	const nextCursor = page.cursor ?? afterInternalId ?? null;
	if (page.customers.length === 0) {
		return { kind: "advanced", cursor: nextCursor };
	}

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
				deferEvents: eventsDefer,
				deferCaches: cachesDefer,
			}),
	});
	await settle();

	return {
		kind: "executed",
		cursor: nextCursor,
		pageResult,
		pagePhases,
	};
};
