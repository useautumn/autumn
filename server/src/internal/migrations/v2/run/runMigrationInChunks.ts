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
import { iterateBatchMigrationChunks } from "./chunks/iterateBatchMigrationChunks.js";
import {
	iterateMigrationChunks,
	type MigrationChunkResult,
	type MigrationChunkRunResult,
} from "./chunks/iterateMigrationChunks.js";
import { iterateMigrationSegments } from "./chunks/iterateMigrationSegments.js";
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
import {
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
	MIGRATION_SEGMENT_SIZE,
} from "./utils/migrationRunConstants.js";

export type RunMigrationChunkRunner = (
	payload: RunMigrationChunkPayload,
) => Promise<MigrationChunkResult>;

/** Runs one round of chunks; resolves only after every chunk has settled. */
export type RunMigrationChunkRoundRunner = (
	payloads: RunMigrationChunkPayload[],
) => Promise<MigrationChunkResult[]>;

const settleChunkRound = async (
	runs: Promise<MigrationChunkResult>[],
): Promise<MigrationChunkResult[]> => {
	const results: MigrationChunkResult[] = [];
	for (const settled of await Promise.allSettled(runs)) {
		if (settled.status === "rejected") throw settled.reason;
		results.push(settled.value);
	}
	return results;
};

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

/** Top-level migration run (successor of runMigration): track the run,
 * prepare once, snapshot, then drive per-chunk workloads until done. */
export const runMigrationInChunks = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	lazyRun = false,
	controls,
	partitions = 1,
	segmentSize = MIGRATION_SEGMENT_SIZE,
	runChunk,
	runChunkRound,
	runBatchChunk,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId?: string;
	dryRun: boolean;
	lazyRun?: boolean;
	controls?: RunMigrationPayload["controls"];
	/** Concurrent chunks for the per-customer lane; budgeted runs stay serial. */
	partitions?: number;
	segmentSize?: number;
	runChunk?: RunMigrationChunkRunner;
	runChunkRound?: RunMigrationChunkRoundRunner;
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
				partitions,
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

				const executeChunk: RunMigrationChunkRunner =
					runChunk ??
					((chunkPayload) =>
						executeRunMigrationChunk({ ctx, payload: chunkPayload }));

				const isCancelRequested = () =>
					isMigrationCancelRequested({ migrationRunId: eventMigrationRunId });
				const buildChunkPayload = ({
					limit,
					chunkIndex,
					cursor,
					floor,
				}: {
					limit: number | undefined;
					chunkIndex: number;
					cursor: string | undefined;
					floor?: string;
				}) =>
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
						floor,
					});

				const runsSegments =
					partitions > 1 &&
					!lazyRun &&
					controls?.limit === undefined &&
					controls?.only === undefined;

				if (runsSegments) {
					const executeRound: RunMigrationChunkRoundRunner =
						runChunkRound ??
						((payloads) => settleChunkRound(payloads.map(executeChunk)));

					const segmentRun = await iterateMigrationSegments({
						partitions,
						isCancelRequested,
						loadIdPage: ({ cursor }) =>
							loadCustomerIdPage({
								ctx,
								migration: preparedMigration,
								migrationRunId: eventMigrationRunId,
								dryRun,
								controls: { ...controls, checkpointDryRun: true },
								cursor,
								pageSize: segmentSize,
							}),
						runRound: (segmentChunks) =>
							executeRound(
								segmentChunks.map(({ chunkIndex, cursor, floor }) =>
									buildChunkPayload({
										limit: undefined,
										chunkIndex,
										cursor,
										floor,
									}),
								),
							),
					});

					return {
						...segmentRun,
						lane: "per_customer" as const,
						rejections: batchLane?.rejections,
					};
				}

				const chunkRun = await iterateMigrationChunks({
					limit: controls?.limit,
					isCancelRequested,
					runChunk: (args) => executeChunk(buildChunkPayload(args)),
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
