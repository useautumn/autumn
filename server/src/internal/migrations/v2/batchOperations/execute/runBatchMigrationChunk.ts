import { withTimeout } from "@autumn/shared";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
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
import { invalidateBatchMigrationCaches } from "../finalize/invalidateBatchMigrationCaches.js";
import { publishBatchMigrationChanges } from "../finalize/publishBatchMigrationChanges.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import {
	claimNextBatchMigrationPage,
	failPageItemRuns,
} from "./claim/index.js";
import {
	createMigrationPageDb,
	type MigrationPageDb,
} from "./database/createMigrationPageDb.js";
import {
	BatchMigrationPageLimitError,
	BatchMigrationStallError,
} from "./errors/batchMigrationErrors.js";
import { executeBatchMigrationPage } from "./executeBatchMigrationPage.js";
import type {
	BatchMigrationChunkResult,
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "./types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS,
	BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS,
	BATCH_MIGRATION_MAX_PAGES,
	BATCH_MIGRATION_MIN_PAGE_BUDGET_MS,
	BATCH_MIGRATION_PAGE_SIZE,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	BATCH_MIGRATION_PAGE_TIMEOUT_MS,
	BATCH_MIGRATION_STALL_LOG_INTERVAL_MS,
} from "./utils/batchMigrationExecutionConstants.js";
import {
	createDeferredSideEffects,
	type DeferredSideEffects,
} from "./utils/deferredSideEffects.js";
import type { BatchMigrationPagePhases } from "./utils/pagePhaseTimings.js";

export type BatchMigrationChunkTimeouts = {
	pageMs?: number;
	deferredOperationMs?: number;
	stallLogMs?: number;
	finalizeReserveMs?: number;
	minPageBudgetMs?: number;
	/** Bounds the checkpoint writes made during recovery. */
	recoveryWriteMs?: number;
};

type PageStage = "claim" | "execute" | "settle";

type LoopOutcome =
	| { ok: true; result: BatchMigrationChunkResult }
	| { ok: false; error: unknown };

type ChunkProgress = {
	page: number;
	stage: PageStage | null;
	stageStartedAt: number;
	pagePhases: BatchMigrationPagePhases;
	claimedCustomers: BatchMigrationPageCustomer[];
	lastPageFinishedAt: number;
};

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
	deadlineAt,
	timeouts,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	afterInternalId?: string;
	maxPages?: number;
	webhooks?: MigrationWebhookControls;
	controls?: MigrationRunControls;
	/** Epoch ms by which the task is killed; pages stop early enough to drain. */
	deadlineAt?: number;
	timeouts?: BatchMigrationChunkTimeouts;
}): Promise<BatchMigrationChunkResult> => {
	const migrationInternalId = getMigrationEventInternalId(migration);
	const pageTimeoutMs = timeouts?.pageMs ?? BATCH_MIGRATION_PAGE_TIMEOUT_MS;
	const deferredOperationTimeoutMs =
		timeouts?.deferredOperationMs ??
		BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS;
	const stallLogMs =
		timeouts?.stallLogMs ?? BATCH_MIGRATION_STALL_LOG_INTERVAL_MS;
	const finalizeReserveMs =
		timeouts?.finalizeReserveMs ?? BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS;
	const minPageBudgetMs =
		timeouts?.minPageBudgetMs ?? BATCH_MIGRATION_MIN_PAGE_BUDGET_MS;
	const recoveryWriteMs =
		timeouts?.recoveryWriteMs ?? BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS;
	const pagesDeadlineAt =
		deadlineAt === undefined ? undefined : deadlineAt - finalizeReserveMs;
	const remainingPageBudgetMs = () =>
		pagesDeadlineAt === undefined
			? Number.POSITIVE_INFINITY
			: pagesDeadlineAt - Date.now();
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

	// Each page publishes its committed changes off the critical path; the
	// chunk drains every publish before it returns.
	const publishes = createDeferredSideEffects({
		phase: "publish_drain",
		phases: chunkPhases,
		logger: ctx.logger,
		logData: { migrationRunId },
		timeoutMs: deferredOperationTimeoutMs,
	});

	const progress: ChunkProgress = {
		page: 0,
		stage: null,
		stageStartedAt: Date.now(),
		pagePhases: {},
		claimedCustomers: [],
		lastPageFinishedAt: Date.now(),
	};
	const describeProgress = () => ({
		migrationRunId,
		page: progress.page,
		stage: progress.stage,
		stageMs: Date.now() - progress.stageStartedAt,
		sinceLastPageMs: Date.now() - progress.lastPageFinishedAt,
		pagePhases: progress.pagePhases,
		publishesPending: publishes.pending(),
	});
	const stallWatchdog = setInterval(() => {
		if (Date.now() - progress.lastPageFinishedAt < stallLogMs) return;
		ctx.logger.warn("batch-migration: chunk stalled", {
			data: describeProgress(),
		});
	}, stallLogMs);
	stallWatchdog.unref?.();

	const finish = (
		completion: BatchMigrationChunkResult["completion"],
	): BatchMigrationChunkResult => ({
		processed: summary.succeeded + summary.skipped,
		completion,
		cursor,
		summary,
	});

	const runPages = async (): Promise<BatchMigrationChunkResult> => {
		while (true) {
			if (await isMigrationCancelRequested({ migrationRunId }))
				return finish("stopped");

			if (maxPages !== undefined && summary.pages >= maxPages)
				return finish("slice_complete");

			// Out of time for another page: hand the cursor to the next chunk
			// rather than start work that can only end in a kill.
			if (remainingPageBudgetMs() < minPageBudgetMs) {
				ctx.logger.warn("batch-migration: chunk yielding before deadline", {
					data: {
						migrationRunId,
						pages: summary.pages,
						remainingPageBudgetMs: remainingPageBudgetMs(),
						minPageBudgetMs,
					},
				});
				return finish("slice_complete");
			}

			if (summary.pages >= BATCH_MIGRATION_MAX_PAGES)
				throw new BatchMigrationPageLimitError({
					maxPages: BATCH_MIGRATION_MAX_PAGES,
				});

			const pageAfterInternalId = cursor ?? undefined;
			const pageNumber = summary.pages + 1;
			const pageStallMessage = `batch-migration: page ${pageNumber} made no progress for ${pageTimeoutMs}ms`;
			const pageDeadlineAt =
				Date.now() + Math.min(pageTimeoutMs, remainingPageBudgetMs());
			const pageDb = createMigrationPageDb({ ctx });
			const outcome = await withTimeout({
				timeoutMs: Math.max(1, pageDeadlineAt - Date.now()),
				fn: () =>
					runNextBatchMigrationPage({
						ctx,
						pageDb,
						migration,
						migrationInternalId,
						migrationRunId,
						plan,
						afterInternalId: pageAfterInternalId,
						pageNumber,
						controls,
						webhooks,
						progress,
						publishes,
					}),
				onTimeout: () => {
					ctx.logger.error("batch-migration: page stalled", {
						data: { ...describeProgress(), pageTimeoutMs },
					});
				},
				timeoutMessage: pageStallMessage,
				timeoutError: (message) =>
					new BatchMigrationStallError({
						phase: `page_${progress.stage ?? "claim"}`,
						message: `${message} (stage: ${progress.stage}, phases: ${JSON.stringify(progress.pagePhases)})`,
					}),
			})
				.catch(async (error: unknown) => {
					// Fence the page before releasing its claims, so no late write lands after.
					pageDb.abort(error);
					await releaseFailedPage({
						ctx,
						migrationInternalId,
						migrationRunId,
						page: pageNumber,
						customers: progress.claimedCustomers,
						recoveryWriteMs,
					});
					throw error;
				})
				.finally(() => pageDb.abort());
			if (outcome.kind === "exhausted") return finish("exhausted");
			cursor = outcome.cursor ?? cursor;
			progress.lastPageFinishedAt = Date.now();
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
	};

	// The bounded drain runs on every exit path; a publish that fails leaves its
	// changes on the item runs for the run's sweep.
	const loop = await runPages().then(
		(result): LoopOutcome => ({ ok: true, result }),
		(error: unknown): LoopOutcome => ({ ok: false, error }),
	);
	clearInterval(stallWatchdog);
	const drained = await publishes.drain();
	if (!loop.ok) throw loop.error;
	if (drained.failures.length > 0)
		ctx.logger.warn(
			"batch-migration: some pages' publishes did not complete; the run's sweep republishes them",
			{
				data: {
					migrationRunId,
					pages: drained.failures.map((failure) => failure.label),
				},
			},
		);
	ctx.logger.info("batch-migration: chunk finished", {
		data: {
			migrationRunId,
			completion: loop.result.completion,
			cursor: loop.result.cursor,
			...summary,
		},
	});
	return loop.result;
};

/** The statement timeout only starts once a connection answers; a dead
 * socket needs the client-side race too, or recovery re-creates the stall. */
const failPageItemRunsBounded = ({
	ctx,
	migrationInternalId,
	migrationRunId,
	internalCustomerIds,
	timeoutMs,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	internalCustomerIds: string[];
	timeoutMs: number;
}): Promise<number> =>
	withTimeout({
		timeoutMs,
		fn: () =>
			withStatementTimeout(
				ctx.db,
				(transaction) =>
					failPageItemRuns({
						db: transaction,
						migrationInternalId,
						migrationRunId,
						internalCustomerIds,
					}),
				timeoutMs,
			),
		timeoutMessage: `batch-migration: failing ${internalCustomerIds.length} claims got no answer from Postgres in ${timeoutMs}ms`,
	});

/** A failed page's writes may have committed (e.g. a lost COMMIT reply), so
 * bust its customers' caches before releasing their claims for retry. */
const releaseFailedPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	page,
	customers,
	recoveryWriteMs,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	page: number;
	customers: BatchMigrationPageCustomer[];
	recoveryWriteMs: number;
}): Promise<void> => {
	if (customers.length === 0) return;
	await invalidateFailedPageCaches({
		ctx,
		migrationRunId,
		page,
		customers,
		recoveryWriteMs,
	});
	const internalCustomerIds = customers.map((customer) => customer.internalId);
	try {
		const failed = await failPageItemRunsBounded({
			ctx,
			migrationInternalId,
			migrationRunId,
			internalCustomerIds,
			timeoutMs: recoveryWriteMs,
		});
		ctx.logger.error("batch-migration: failed page claims released for retry", {
			data: {
				migrationRunId,
				page,
				customers: internalCustomerIds.length,
				failed,
			},
		});
	} catch (error) {
		ctx.logger.error(
			"batch-migration: could not release a failed page's claims — the parent settles running claims when the run ends",
			{
				data: {
					migrationRunId,
					page,
					customers: internalCustomerIds.length,
					error: error instanceof Error ? error.message : String(error),
				},
			},
		);
	}
};

const invalidateFailedPageCaches = async ({
	ctx,
	migrationRunId,
	page,
	customers,
	recoveryWriteMs,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	page: number;
	customers: BatchMigrationPageCustomer[];
	recoveryWriteMs: number;
}) => {
	try {
		await withTimeout({
			timeoutMs: recoveryWriteMs,
			fn: () => invalidateBatchMigrationCaches({ ctx, customers }),
			timeoutMessage: `batch-migration: invalidating ${customers.length} failed-page caches exceeded ${recoveryWriteMs}ms`,
		});
	} catch (error) {
		ctx.logger.error(
			"batch-migration: could not invalidate a failed page's caches — customers may hold stale caches",
			{
				data: {
					migrationRunId,
					page,
					customers: customers.length,
					error: error instanceof Error ? error.message : String(error),
				},
			},
		);
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

/** One claim → execute → publish. The cursor advances only on success. */
const runNextBatchMigrationPage = async ({
	ctx,
	pageDb,
	migration,
	migrationInternalId,
	migrationRunId,
	plan,
	afterInternalId,
	pageNumber,
	controls,
	webhooks,
	progress,
	publishes,
}: {
	ctx: AutumnContext;
	pageDb: MigrationPageDb;
	migration: MigrationRuntimeWithEventId;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	afterInternalId?: string;
	pageNumber: number;
	controls?: MigrationRunControls;
	webhooks?: MigrationWebhookControls;
	progress: ChunkProgress;
	publishes: DeferredSideEffects;
}): Promise<NextPageOutcome> => {
	const pageCtx = { ...ctx, db: pageDb.db };
	const pagePhases: BatchMigrationPagePhases = {};
	const enterStage = (stage: PageStage) => {
		pageDb.assertActive();
		progress.page = pageNumber;
		progress.stage = stage;
		progress.stageStartedAt = Date.now();
		progress.pagePhases = pagePhases;
	};

	progress.claimedCustomers = [];
	enterStage("claim");
	const page = await claimNextBatchMigrationPage({
		ctx: pageCtx,
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

	progress.claimedCustomers = page.customers;
	enterStage("execute");
	const pageResult = await executeBatchMigrationPage({
		ctx: pageCtx,
		migrationInternalId,
		migrationRunId,
		plan,
		customers: page.customers,
		phases: pagePhases,
	});

	// A retried customer may already be converged (skipped) yet carry a stale
	// cache from an interrupted attempt that predates recorded changes.
	const invalidateSkipped = (controls?.retryItemStatuses?.length ?? 0) > 0;
	publishes.defer({
		label: `page ${pageNumber}`,
		run: () =>
			publishBatchMigrationChanges({
				ctx,
				migrationInternalId,
				migrationRunId,
				plan,
				webhooks,
				internalCustomerIds: page.customers.map(
					(customer) => customer.internalId,
				),
				invalidateSkipped,
			}),
	});
	enterStage("settle");
	await publishes.settle();

	return {
		kind: "executed",
		cursor: nextCursor,
		pageResult,
		pagePhases,
	};
};
