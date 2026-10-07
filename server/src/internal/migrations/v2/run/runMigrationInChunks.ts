import type { Migration } from "@autumn/shared";
import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import type { BatchMigrationChunkResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGES_PER_CHUNK } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { generateId } from "@/utils/genUtils.js";
import { withMigrationRunTracking } from "../actions/migrationRun/index.js";
import type { MigrationWebhookControls } from "../cloudAdapter/types.js";
import { runFilter } from "../filters/runFilter.js";
import type { MigrationRuntimeWithEventId } from "../types/migrationDefinition.js";
import { shouldRunBatchLane } from "../utils/shouldRunBatchLane.js";
import { resolveMigrationWebhookControls } from "../webhookDelivery/utils/resolveMigrationWebhookControls.js";
import { createInProcessChunkDispatcher } from "./chunks/createInProcessChunkDispatcher.js";
import { iterateBatchMigrationChunks } from "./chunks/iterateBatchMigrationChunks.js";
import { scheduleMigrationChunks } from "./chunks/scheduleMigrationChunks.js";
import { executeRunMigrationChunk } from "./executeRunMigrationChunk.js";
import { prepareMigration } from "./runMigration.js";
import type { MigrationChunkDispatcher } from "./types/migrationChunkDispatcher.js";
import type { MigrationChunkRunResult } from "./types/migrationChunkResult.js";
import {
	buildRunBatchMigrationChunkPayload,
	buildRunMigrationChunkPayload,
	PreparedMigrationSnapshotSchema,
	type RunBatchMigrationChunkPayload,
	type RunMigrationChunkPayload,
	type RunMigrationPayload,
} from "./types/migrationRunPayloads.js";
import {
	MIGRATION_CHUNK_CONCURRENCY,
	MIGRATION_CHUNK_SIZE,
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
} from "./utils/migrationRunConstants.js";

export type RunBatchMigrationChunkRunner = (
	payload: RunBatchMigrationChunkPayload,
) => Promise<BatchMigrationChunkResult>;

/** The batch lane: budgeted chunks (PAGES_PER_CHUNK pages each) dispatched
 * through `runBatchChunk` — the trigger path shares migrationTaskQueue so
 * concurrent migrations interleave fairly; in-process runs use the same
 * budget loop. */
const runBatchMigrationLane = async ({
	ctx,
	migrationRunId,
	migrationSnapshot,
	plan,
	webhooks,
	controls,
	runBatchChunk,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migrationSnapshot: RunBatchMigrationChunkPayload["migration"];
	plan: BatchMigrationExecutionPlan;
	webhooks: MigrationWebhookControls;
	controls: RunMigrationPayload["controls"];
	runBatchChunk?: RunBatchMigrationChunkRunner;
}): Promise<MigrationChunkRunResult> => {
	const executeBatchChunk: RunBatchMigrationChunkRunner =
		runBatchChunk ??
		((payload) =>
			runBatchMigrationChunk({
				ctx,
				migration: payload.migration,
				migrationRunId: payload.migrationRunId,
				plan: payload.plan,
				afterInternalId: payload.cursor,
				maxPages: BATCH_MIGRATION_PAGES_PER_CHUNK,
				webhooks: payload.webhooks,
				controls: payload.controls,
			}));

	const result = await iterateBatchMigrationChunks({
		runChunk: ({ chunkIndex, cursor }) =>
			executeBatchChunk(
				buildRunBatchMigrationChunkPayload({
					ctx,
					migrationRunId,
					migration: migrationSnapshot,
					plan,
					chunkIndex,
					cursor,
					webhooks,
					controls,
				}),
			),
	});
	return {
		processed: result.processed,
		chunks: result.pages,
		canceled: result.canceled,
		lane: "batch",
	};
};

/** The per-customer lane: walk the filtered customers one page at a time and
 * keep `chunkConcurrency` chunk tasks migrating those pages. */
const runPerCustomerMigrationLane = async ({
	ctx,
	migration,
	migrationSnapshot,
	migrationRunId,
	dryRun,
	lazyRun,
	controls,
	chunkSize,
	chunkConcurrency,
	dispatcher,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationSnapshot: RunMigrationChunkPayload["migration"];
	migrationRunId: string;
	dryRun: boolean;
	lazyRun: boolean;
	controls: RunMigrationPayload["controls"];
	chunkSize: number;
	chunkConcurrency: number;
	dispatcher: MigrationChunkDispatcher;
}): Promise<MigrationChunkRunResult> => {
	const { iterate } = await runFilter({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		kind: "customer",
		// Chunks checkpoint dry runs too, so the walk sees what they see.
		controls: { ...controls, checkpointDryRun: true },
		includeCount: false,
		batchSize: chunkSize,
	});

	return scheduleMigrationChunks({
		pages: iterate(),
		concurrency: chunkConcurrency,
		isCancelRequested: () => isMigrationCancelRequested({ migrationRunId }),
		dispatcher,
		buildPayload: ({ pageIndex, attempt, customers }) =>
			buildRunMigrationChunkPayload({
				ctx,
				migrationId: migration.id,
				migrationRunId,
				dryRun,
				lazyRun,
				migration: migrationSnapshot,
				controls,
				pageIndex,
				attempt,
				customers,
			}),
	});
};

/** Top-level migration run (successor of runMigration): track the run,
 * prepare once, snapshot, then drive per-chunk workloads until done. */
export const runMigrationInChunks = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	lazyRun = false,
	controls,
	chunkSize = MIGRATION_CHUNK_SIZE,
	chunkConcurrency = MIGRATION_CHUNK_CONCURRENCY,
	dispatcher = createInProcessChunkDispatcher({
		runChunk: (payload) => executeRunMigrationChunk({ ctx, payload }),
	}),
	runBatchChunk,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId?: string;
	dryRun: boolean;
	lazyRun?: boolean;
	controls?: RunMigrationPayload["controls"];
	chunkSize?: number;
	chunkConcurrency?: number;
	dispatcher?: MigrationChunkDispatcher;
	runBatchChunk?: RunBatchMigrationChunkRunner;
}): Promise<MigrationChunkRunResult> => {
	const eventMigrationRunId = migrationRunId ?? generateId("mrun");

	try {
		return await withMigrationRunTracking({
			ctx,
			migrationRunId: eventMigrationRunId,
			migrationInternalId: migration.internal_id,

			logData: {
				migrationId: migration.id,
				dryRun,
				noBillingChanges: migration.no_billing_changes === true,
				concurrency: MIGRATION_RUN_CUSTOMER_CONCURRENCY,
				chunkConcurrency,
				only: controls?.only,
				limit: controls?.limit,
				retryItemStatuses: controls?.retryItemStatuses,
			},

			run: async () => {
				const preparedMigration = await prepareMigration({
					ctx,
					migration,
					dryRun,
				});

				const migrationSnapshot =
					PreparedMigrationSnapshotSchema.parse(preparedMigration);

				// Lane decision is all-or-nothing: batch (set-based pages) or
				// per-customer — never both. Lazy runs stay per-customer.
				const batchLane = lazyRun
					? undefined
					: await shouldRunBatchLane({
							ctx,
							migration: preparedMigration,
							migrationRunId: eventMigrationRunId,
							dryRun,
							controls,
							hasCustomHooks: false,
							hasCloudBatchAdapter: false,
						});

				if (batchLane?.shouldRun) {
					return runBatchMigrationLane({
						ctx,
						migrationRunId: eventMigrationRunId,
						migrationSnapshot,
						controls,
						plan: batchMigrationPlanToExecutionPlan({ plan: batchLane.plan }),
						webhooks: await resolveMigrationWebhookControls({
							ctx,
							filter: migration.filter,
							params: controls?.webhooks,
							lazyRun,
							dryRun,
						}),
						runBatchChunk,
					});
				}

				const chunkRun = await runPerCustomerMigrationLane({
					ctx,
					migration: preparedMigration,
					migrationSnapshot,
					migrationRunId: eventMigrationRunId,
					dryRun,
					lazyRun,
					controls,
					chunkSize,
					chunkConcurrency,
					dispatcher,
				});

				return {
					...chunkRun,
					lane: "per_customer" as const,
					rejections: batchLane?.rejections,
				};
			},
		});
	} finally {
		if (lazyRun && !dryRun) {
			await clearOrgCache({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				logger: ctx.logger,
			});
		}
	}
};
