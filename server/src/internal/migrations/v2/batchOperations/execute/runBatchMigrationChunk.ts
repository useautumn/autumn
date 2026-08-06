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
	BATCH_MIGRATION_DEFERRED_INFLIGHT,
	BATCH_MIGRATION_MAX_PAGES,
	BATCH_MIGRATION_PAGE_SIZE,
} from "./utils/batchMigrationExecutionConstants.js";
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
	// before the chunk returns. Pages touch disjoint customers, so they overlap
	// safely; the in-flight cap keeps a slow dependency from accumulating.
	const deferred = (phase: string) => {
		// Rejections are captured here, never left on the promise: an orphaned
		// rejected promise would surface as an unhandledRejection and kill the
		// worker, and a rejecting Promise.race would abort the page loop.
		const inflight = new Set<Promise<void>>();
		const errors: unknown[] = [];
		const defer = (run: () => Promise<unknown>) => {
			const pending = run()
				.then(
					() => undefined,
					(error: unknown) => {
						errors.push(error);
					},
				)
				.finally(() => {
					inflight.delete(pending);
				});
			inflight.add(pending);
		};
		const drain = async () => {
			if (inflight.size === 0 && errors.length === 0) return;
			if (inflight.size > 0)
				await timePhase({
					phases: chunkPhases,
					phase,
					run: () => Promise.all([...inflight]),
				});
			if (errors.length > 0)
				ctx.logger.error(`batch-migration: deferred ${phase} failed`, {
					data: {
						migrationRunId,
						failed: errors.length,
						error: String(errors[0]),
					},
				});
		};
		const settle = async () => {
			while (inflight.size >= BATCH_MIGRATION_DEFERRED_INFLIGHT)
				await Promise.race(inflight);
		};
		return { defer, drain, settle };
	};

	const events = deferred("finalize_events_drain");
	const caches = deferred("finalize_caches_drain");

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

	// finally, not just the success paths: a throw mid-loop must never orphan a
	// pending cache invalidation — that is silent, unrecoverable staleness.
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
