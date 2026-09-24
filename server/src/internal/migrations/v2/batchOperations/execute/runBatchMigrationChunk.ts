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
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import {
	claimNextBatchMigrationPage,
	failPageItemRuns,
} from "./claim/index.js";
import { executeBatchMigrationPage } from "./executeBatchMigrationPage.js";
import { finalizeBatchMigrationPage } from "./finalize/finalizeBatchMigrationPage.js";
import type {
	BatchMigrationChunkResult,
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
	BATCH_MIGRATION_TRANSIENT_DB_PAGE_ATTEMPTS,
	BATCH_MIGRATION_TRANSIENT_DB_RETRY_DELAY_MS,
} from "./utils/batchMigrationExecutionConstants.js";
import {
	createDeferredSideEffects,
	type DeferredOperation,
} from "./utils/deferredSideEffects.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";
import { runWithTransientDbRetry } from "./utils/runWithTransientDbRetry.js";

export type BatchMigrationChunkTimeouts = {
	pageMs?: number;
	deferredOperationMs?: number;
	stallLogMs?: number;
	finalizeReserveMs?: number;
	minPageBudgetMs?: number;
	/** Bounds the checkpoint writes made during recovery. */
	recoveryWriteMs?: number;
};

/** A phase stopped making progress inside its budget. Not a transient DB
 * error, so the page retry wrapper lets it surface. */
export class BatchMigrationStallError extends Error {
	readonly phase: string;

	constructor({ phase, message }: { phase: string; message: string }) {
		super(message);
		this.name = "BatchMigrationStallError";
		this.phase = phase;
	}
}

type PageStage = "claim" | "execute" | "finalize" | "settle";

type LoopOutcome =
	| { ok: true; result: BatchMigrationChunkResult }
	| { ok: false; error: unknown };

type ChunkProgress = {
	page: number;
	stage: PageStage | null;
	stageStartedAt: number;
	pagePhases: BatchMigrationPagePhases;
	claimedInternalIds: string[];
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

	// Post-commit side effects run off the page's critical path and are drained
	// before the chunk returns.
	const deferredLogData = { migrationRunId };
	const events = createDeferredSideEffects({
		phase: "finalize_events_drain",
		phases: chunkPhases,
		logger: ctx.logger,
		logData: deferredLogData,
		timeoutMs: deferredOperationTimeoutMs,
	});
	const caches = createDeferredSideEffects({
		phase: "finalize_caches_drain",
		phases: chunkPhases,
		logger: ctx.logger,
		logData: deferredLogData,
		timeoutMs: deferredOperationTimeoutMs,
	});

	const progress: ChunkProgress = {
		page: 0,
		stage: null,
		stageStartedAt: Date.now(),
		pagePhases: {},
		claimedInternalIds: [],
		lastPageFinishedAt: Date.now(),
	};
	const describeProgress = () => ({
		migrationRunId,
		page: progress.page,
		stage: progress.stage,
		stageMs: Date.now() - progress.stageStartedAt,
		sinceLastPageMs: Date.now() - progress.lastPageFinishedAt,
		pagePhases: progress.pagePhases,
		cachesPending: caches.pending(),
		eventsPending: events.pending(),
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
				throw new Error(
					`batch-migration: exceeded ${BATCH_MIGRATION_MAX_PAGES} pages — aborting run`,
				);

			const pageAfterInternalId = cursor ?? undefined;
			const pageNumber = summary.pages + 1;
			const pageStallMessage = `batch-migration: page ${pageNumber} made no progress for ${pageTimeoutMs}ms`;
			// One budget across the transient retries (or five attempts could each
			// spend the full page timeout), clipped to the chunk's own deadline.
			const pageDeadlineAt =
				Date.now() + Math.min(pageTimeoutMs, remainingPageBudgetMs());
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
								error: error instanceof Error ? error.message : String(error),
							},
						},
					);
				},
				run: () =>
					withTimeout({
						timeoutMs: Math.max(1, pageDeadlineAt - Date.now()),
						fn: () =>
							runNextBatchMigrationPage({
								ctx,
								migration,
								migrationInternalId,
								migrationRunId,
								plan,
								afterInternalId: pageAfterInternalId,
								pageNumber,
								controls,
								webhooks,
								progress,
								recoveryWriteMs,
								eventsDefer: events.defer,
								cachesDefer: caches.defer,
								settle: () => Promise.all([caches.settle(), events.settle()]),
							}),
						onTimeout: () => {
							ctx.logger.error("batch-migration: page stalled", {
								data: { ...describeProgress(), pageTimeoutMs },
							});
						},
						timeoutMessage: pageStallMessage,
					}).catch(async (error: unknown) => {
						if (error instanceof Error && error.message === pageStallMessage) {
							// The abandoned page may still commit its marks later; failing
							// its claims now keeps those customers on the retry path.
							await failClaimsOfStalledPage({
								ctx,
								migrationInternalId,
								migrationRunId,
								page: pageNumber,
								internalCustomerIds: progress.claimedInternalIds,
								recoveryWriteMs,
							});
							throw new BatchMigrationStallError({
								phase: `page_${progress.stage ?? "claim"}`,
								message: `${error.message} (stage: ${progress.stage}, phases: ${JSON.stringify(progress.pagePhases)})`,
							});
						}
						throw error;
					}),
			});
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

	// The bounded drain runs on every exit path: an orphaned cache invalidation
	// is silent, unrecoverable staleness.
	const loop = await runPages().then(
		(result): LoopOutcome => ({ ok: true, result }),
		(error: unknown): LoopOutcome => ({ ok: false, error }),
	);
	clearInterval(stallWatchdog);
	const [cachesDrained] = await Promise.all([caches.drain(), events.drain()]);
	if (!loop.ok) throw loop.error;
	if (cachesDrained.failures.length > 0) {
		const timedOut = cachesDrained.failures.filter(
			(failure) => failure.timedOut,
		).length;
		throw new BatchMigrationStallError({
			phase: "finalize_caches",
			message: `batch-migration: cache invalidation did not complete for ${cachesDrained.failures.length} page(s) (${timedOut} timed out; ${cachesDrained.failures.map((failure) => failure.label).join(", ")}); checkpoints revoked for retry where the revoke succeeded (see per-page logs)`,
		});
	}
	// "finished" means every page's side effects landed, not just the loop.
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

const failClaimsOfStalledPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	page,
	internalCustomerIds,
	recoveryWriteMs,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	page: number;
	internalCustomerIds: string[];
	recoveryWriteMs: number;
}): Promise<void> => {
	if (internalCustomerIds.length === 0) return;
	try {
		const failed = await failPageItemRunsBounded({
			ctx,
			migrationInternalId,
			migrationRunId,
			internalCustomerIds,
			timeoutMs: recoveryWriteMs,
		});
		ctx.logger.error("batch-migration: stalled page claims failed for retry", {
			data: {
				migrationRunId,
				page,
				customers: internalCustomerIds.length,
				failed,
			},
		});
	} catch (error) {
		ctx.logger.error(
			"batch-migration: could not fail a stalled page's claims — the parent settles them when the run ends",
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
	pageNumber,
	controls,
	webhooks,
	progress,
	recoveryWriteMs,
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
	pageNumber: number;
	controls?: MigrationRunControls;
	webhooks?: MigrationWebhookControls;
	progress: ChunkProgress;
	recoveryWriteMs: number;
	eventsDefer: (operation: DeferredOperation) => void;
	cachesDefer: (operation: DeferredOperation) => void;
	settle: () => Promise<unknown>;
}): Promise<NextPageOutcome> => {
	const pagePhases: BatchMigrationPagePhases = {};
	const enterStage = (stage: PageStage) => {
		progress.page = pageNumber;
		progress.stage = stage;
		progress.stageStartedAt = Date.now();
		progress.pagePhases = pagePhases;
	};

	progress.claimedInternalIds = [];
	enterStage("claim");
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

	progress.claimedInternalIds = page.customers.map(
		(customer) => customer.internalId,
	);
	enterStage("execute");
	const pageResult = await executeBatchMigrationPage({
		ctx,
		migrationInternalId,
		migrationRunId,
		plan,
		customers: page.customers,
		phases: pagePhases,
	});

	const label = `page ${pageNumber}`;
	// A retried customer may already be converged (skipped) yet carry a stale
	// cache from the interrupted attempt, so retries invalidate skipped too.
	const invalidateSkipped = (controls?.retryItemStatuses?.length ?? 0) > 0;
	const revokeCheckpoints = async (error: unknown) => {
		const internalCustomerIds = [
			...pageResult.succeeded,
			...(invalidateSkipped ? pageResult.skipped : []),
		].map((customer) => customer.internalId);
		const logData = {
			migrationRunId,
			page: pageNumber,
			customers: internalCustomerIds.length,
			sampleCustomerIds: internalCustomerIds.slice(0, 5),
			error: error instanceof Error ? error.message : String(error),
		};
		try {
			const revoked = await failPageItemRunsBounded({
				ctx,
				migrationInternalId,
				migrationRunId,
				internalCustomerIds,
				timeoutMs: recoveryWriteMs,
			});
			ctx.logger.error(
				"batch-migration: page cache invalidation incomplete — checkpoints revoked for retry",
				{ data: { ...logData, revoked } },
			);
		} catch (revokeError) {
			ctx.logger.error(
				"batch-migration: page cache invalidation incomplete AND checkpoint revoke failed — customers may hold stale caches",
				{
					data: {
						...logData,
						revokeError:
							revokeError instanceof Error
								? revokeError.message
								: String(revokeError),
					},
				},
			);
			throw revokeError;
		}
	};

	enterStage("finalize");
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
				invalidateSkipped,
				deferEvents: (emit) => eventsDefer({ label, run: emit }),
				deferCaches: (invalidate) =>
					cachesDefer({
						label,
						run: invalidate,
						onFailure: revokeCheckpoints,
					}),
			}),
	});
	enterStage("settle");
	await settle();

	return {
		kind: "executed",
		cursor: nextCursor,
		pageResult,
		pagePhases,
	};
};
