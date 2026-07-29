import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import type { BatchMigrationChunkResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGES_PER_CHUNK } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { generateId } from "@/utils/genUtils.js";
import { withMigrationRunTracking } from "../actions/migrationRun/index.js";
import type { MigrationRuntimeWithEventId } from "../types/migrationDefinition.js";
import { shouldRunBatchLane } from "../utils/shouldRunBatchLane.js";
import { iterateBatchMigrationChunks } from "./chunks/iterateBatchMigrationChunks.js";
import {
	iterateMigrationChunks,
	type MigrationChunkResult,
	type MigrationChunkRunResult,
} from "./chunks/iterateMigrationChunks.js";
import { executeRunMigrationChunk } from "./executeRunMigrationChunk.js";
import { prepareMigration } from "./runMigration.js";
import {
	buildRunBatchMigrationChunkPayload,
	buildRunMigrationChunkPayload,
	PreparedMigrationSnapshotSchema,
	type RunBatchMigrationChunkPayload,
	type RunMigrationChunkPayload,
	type RunMigrationPayload,
} from "./types/migrationRunPayloads.js";
import { isMigrationCancelRequested } from "./utils/migrationCancelToken.js";
import { MIGRATION_RUN_CUSTOMER_CONCURRENCY } from "./utils/migrationRunConstants.js";

export type RunMigrationChunkRunner = (
	payload: RunMigrationChunkPayload,
) => Promise<MigrationChunkResult>;

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
	runBatchChunk,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migrationSnapshot: RunBatchMigrationChunkPayload["migration"];
	plan: BatchMigrationExecutionPlan;
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

/** Top-level migration run (successor of runMigration): track the run,
 * prepare once, snapshot, then drive per-chunk workloads until done. */
export const runMigrationInChunks = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	lazyRun = false,
	controls,
	runChunk,
	runBatchChunk,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId?: string;
	dryRun: boolean;
	lazyRun?: boolean;
	controls?: RunMigrationPayload["controls"];
	runChunk?: RunMigrationChunkRunner;
	runBatchChunk?: RunBatchMigrationChunkRunner;
}): Promise<MigrationChunkRunResult> => {
	const eventMigrationRunId = migrationRunId ?? generateId("mrun");

	try {
		return await withMigrationRunTracking({
			ctx,
			migrationRunId: eventMigrationRunId,

			logData: {
				migrationId: migration.id,
				dryRun,
				noBillingChanges: migration.no_billing_changes === true,
				concurrency: MIGRATION_RUN_CUSTOMER_CONCURRENCY,
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
						plan: batchMigrationPlanToExecutionPlan({ plan: batchLane.plan }),
						runBatchChunk,
					});
				}

				const executeChunk: RunMigrationChunkRunner =
					runChunk ??
					((chunkPayload) =>
						executeRunMigrationChunk({ ctx, payload: chunkPayload }));

				const chunkRun = await iterateMigrationChunks({
					limit: controls?.limit,
					isCancelRequested: () =>
						isMigrationCancelRequested({
							migrationRunId: eventMigrationRunId,
						}),

					runChunk: ({ limit, chunkIndex, cursor }) =>
						executeChunk(
							buildRunMigrationChunkPayload({
								ctx,
								migrationId: migration.id,
								migrationRunId: eventMigrationRunId,
								dryRun,
								lazyRun,
								migration: migrationSnapshot,
								controls,
								limit,
								chunkIndex,
								cursor,
							}),
						),
				});

				return { ...chunkRun, lane: "per_customer" as const };
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
