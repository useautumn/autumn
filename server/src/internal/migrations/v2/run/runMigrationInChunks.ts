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
import { loadCustomerIdPage } from "../filters/runFilter.js";
import type { MigrationRuntimeWithEventId } from "../types/migrationDefinition.js";
import { shouldRunBatchLane } from "../utils/shouldRunBatchLane.js";
import { resolveMigrationWebhookControls } from "../webhookDelivery/utils/resolveMigrationWebhookControls.js";
import { carveMigrationSegments } from "./chunks/carveMigrationSegments.js";
import { dealSegmentsToLanes } from "./chunks/dealSegmentsToLanes.js";
import { iterateBatchMigrationChunks } from "./chunks/iterateBatchMigrationChunks.js";
import {
	iterateMigrationChunks,
	type MigrationChunkResult,
	type MigrationChunkRunResult,
} from "./chunks/iterateMigrationChunks.js";
import { executeRunMigrationChunk } from "./executeRunMigrationChunk.js";
import { executeRunMigrationLane } from "./executeRunMigrationLane.js";
import { prepareMigration } from "./runMigration.js";
import {
	buildRunBatchMigrationChunkPayload,
	buildRunMigrationChunkPayload,
	buildRunMigrationLanePayload,
	PreparedMigrationSnapshotSchema,
	type RunBatchMigrationChunkPayload,
	type RunMigrationChunkPayload,
	type RunMigrationLanePayload,
	type RunMigrationPayload,
} from "./types/migrationRunPayloads.js";
import {
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
	MIGRATION_SEGMENT_SIZE,
} from "./utils/migrationRunConstants.js";
import { settleAll } from "./utils/settleAll.js";

export type RunMigrationChunkRunner = (
	payload: RunMigrationChunkPayload,
) => Promise<MigrationChunkResult>;

/** Runs K lanes side by side and resolves only after every lane has settled. */
export type RunMigrationLanesRunner = (
	payloads: RunMigrationLanePayload[],
) => Promise<MigrationChunkRunResult[]>;

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

type PerCustomerRun = {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationSnapshot: RunMigrationChunkPayload["migration"];
	migrationRunId: string;
	dryRun: boolean;
	lazyRun: boolean;
	controls: RunMigrationPayload["controls"];
};

/** Today's serial walk: one chunk at a time along the whole keyset. */
const runSerialChunks = ({
	run,
	executeChunk,
}: {
	run: PerCustomerRun;
	executeChunk: RunMigrationChunkRunner;
}): Promise<MigrationChunkRunResult> =>
	iterateMigrationChunks({
		limit: run.controls?.limit,
		isCancelRequested: () =>
			isMigrationCancelRequested({ migrationRunId: run.migrationRunId }),
		runChunk: ({ limit, chunkIndex, cursor, floor }) =>
			executeChunk(
				buildRunMigrationChunkPayload({
					ctx: run.ctx,
					migrationId: run.migration.id,
					migrationRunId: run.migrationRunId,
					dryRun: run.dryRun,
					lazyRun: run.lazyRun,
					migration: run.migrationSnapshot,
					controls: run.controls,
					limit,
					chunkIndex,
					cursor,
					floor,
				}),
			),
	});

/** Fan-out: carve the keyset into segments once, deal them to K lanes, and
 * let every lane walk its own share until all have settled. */
const runPipelinedLanes = async ({
	run,
	laneCount,
	segmentSize,
	executeLanes,
}: {
	run: PerCustomerRun;
	laneCount: number;
	segmentSize: number;
	executeLanes: RunMigrationLanesRunner;
}): Promise<MigrationChunkRunResult> => {
	const segments = await carveMigrationSegments({
		loadIdPage: ({ cursor }) =>
			loadCustomerIdPage({
				ctx: run.ctx,
				migration: run.migration,
				migrationRunId: run.migrationRunId,
				dryRun: run.dryRun,
				// Chunks checkpoint dry runs too, so the walk sees what they see.
				controls: { ...run.controls, checkpointDryRun: true },
				cursor,
				pageSize: segmentSize,
			}),
	});
	const lanePayloads = dealSegmentsToLanes({ segments, laneCount }).map(
		(laneSegments, laneIndex) =>
			buildRunMigrationLanePayload({
				ctx: run.ctx,
				migrationId: run.migration.id,
				migrationRunId: run.migrationRunId,
				dryRun: run.dryRun,
				lazyRun: run.lazyRun,
				migration: run.migrationSnapshot,
				controls: run.controls,
				laneIndex,
				segments: laneSegments,
			}),
	);
	const lanes = await executeLanes(lanePayloads);
	return {
		processed: lanes.reduce((sum, lane) => sum + lane.processed, 0),
		chunks: lanes.reduce((sum, lane) => sum + lane.chunks, 0),
		canceled: lanes.some((lane) => lane.canceled),
	};
};

/** The per-customer lane: serial, or K pipelined lanes when the run may fan out. */
const runPerCustomerChunks = ({
	run,
	laneCount,
	segmentSize,
	runChunk,
	runLanes,
}: {
	run: PerCustomerRun;
	laneCount: number;
	segmentSize: number;
	runChunk?: RunMigrationChunkRunner;
	runLanes?: RunMigrationLanesRunner;
}): Promise<MigrationChunkRunResult> => {
	const executeChunk: RunMigrationChunkRunner =
		runChunk ??
		((payload) => executeRunMigrationChunk({ ctx: run.ctx, payload }));
	const executeLanes: RunMigrationLanesRunner =
		runLanes ??
		((lanePayloads) =>
			settleAll(
				lanePayloads.map((payload) =>
					executeRunMigrationLane({
						ctx: run.ctx,
						payload,
						runChunk: executeChunk,
					}),
				),
			));

	// `limit` and `only` spend the keyset in order, so budgeted runs stay serial.
	const spendsKeysetInOrder =
		run.lazyRun ||
		run.controls?.limit !== undefined ||
		run.controls?.only !== undefined;
	if (laneCount === 1 || spendsKeysetInOrder) {
		return runSerialChunks({ run, executeChunk });
	}
	return runPipelinedLanes({ run, laneCount, segmentSize, executeLanes });
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
	laneCount = 1,
	segmentSize = MIGRATION_SEGMENT_SIZE,
	runChunk,
	runLanes,
	runBatchChunk,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId?: string;
	dryRun: boolean;
	lazyRun?: boolean;
	controls?: RunMigrationPayload["controls"];
	/** Lanes walking the per-customer keyset at once; 1 is the serial run. */
	laneCount?: number;
	segmentSize?: number;
	runChunk?: RunMigrationChunkRunner;
	runLanes?: RunMigrationLanesRunner;
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
				laneCount,
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

				const chunkRun = await runPerCustomerChunks({
					run: {
						ctx,
						migration: preparedMigration,
						migrationSnapshot,
						migrationRunId: eventMigrationRunId,
						dryRun,
						lazyRun,
						controls,
					},
					laneCount,
					segmentSize,
					runChunk,
					runLanes,
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
