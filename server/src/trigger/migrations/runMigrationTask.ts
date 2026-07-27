import { task } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withMigrationRunTracking } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { isMigrationCancelRequested } from "@/internal/migrations/v2/run/utils/migrationCancelToken.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import {
	PreparedMigrationSnapshotSchema,
	type RunMigrationChunkPayload,
	RunMigrationPayloadSchema,
	type RunMigrationPayload as RunMigrationPayloadType,
} from "@/trigger/migrations/migrationTaskPayload.js";
import {
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
	MIGRATION_TASK_RETRY,
} from "@/trigger/migrations/migrationTaskQueue.js";
import {
	executeRunMigrationChunk,
	runMigrationChunkTask,
} from "@/trigger/migrations/runMigrationChunkTask.js";
import {
	type MigrationChunkResult,
	runMigrationInChunks,
} from "@/trigger/migrations/runMigrationInChunks.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

export type RunMigrationPayload = RunMigrationPayloadType;

export type RunMigrationChunkRunner = (
	payload: RunMigrationChunkPayload,
) => Promise<MigrationChunkResult>;

/** Shared workload for the trigger.dev task and the local inline fallback. */
export const executeRunMigration = async ({
	ctx,
	logger,
	payload,
	runChunk,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunMigrationPayload;
	runChunk?: RunMigrationChunkRunner;
}) => {
	const { orgId, env, migrationId, migrationRunId, dryRun, lazyRun, controls } =
		payload;

	// Trigger tasks start with cold Redis clients; warm them before preparation
	// and cache work so availability checks do not short-circuit.
	await warmupRegionalRedis().catch((error) => {
		logger.warn("run-migration: redis warmup failed (continuing)", {
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
	});

	logger.info("run-migration: starting", {
		data: {
			migrationId,
			migrationRunId,
			dryRun,
			only: controls?.only,
			onlyCount: controls?.only?.length,
			limit: controls?.limit,
			retryItemStatuses: controls?.retryItemStatuses,
		},
	});

	try {
		await withMigrationRunTracking({
			ctx,
			migrationRunId,
			run: async () => {
				const migration = await migrationRepo.find({ ctx, id: migrationId });
				const preparedMigration = await prepareMigration({
					ctx,
					migration,
					dryRun,
				});
				const migrationSnapshot =
					PreparedMigrationSnapshotSchema.parse(preparedMigration);
				const executeChunk: RunMigrationChunkRunner =
					runChunk ??
					((chunkPayload) =>
						executeRunMigrationChunk({ ctx, logger, payload: chunkPayload }));

				logger.info("run-migration: resolved controls", {
					data: {
						migrationRunId,
						noBillingChanges: migration.no_billing_changes === true,
						concurrency: MIGRATION_RUN_CUSTOMER_CONCURRENCY,
					},
				});

				const chunkRun = await runMigrationInChunks({
					limit: controls?.limit,
					isCancelRequested: () =>
						isMigrationCancelRequested({ migrationRunId }),
					runChunk: ({ limit, chunkIndex, cursor }) =>
						executeChunk({
							...payload,
							chunkIndex,
							cursor,
							migration: migrationSnapshot,
							controls: {
								...(controls ?? {}),
								...(limit === undefined ? {} : { limit }),
							},
						}),
				});

				logger.info("run-migration: chunks complete", {
					data: { migrationRunId, ...chunkRun },
				});
			},
		});
	} finally {
		if (lazyRun && !dryRun) {
			await clearOrgCache({
				db: ctx.db,
				orgId,
				env,
				logger,
			});
		}
	}

	logger.info("run-migration: done", {
		data: {
			migrationId,
			dryRun,
		},
	});
};

export const runMigrationTask = task({
	id: "run-migration",
	retry: MIGRATION_TASK_RETRY,
	machine: "medium-1x",
	// Trigger.dev has no true "disable" — set very high to effectively remove the timeout.
	maxDuration: 86400,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunMigrationPayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		await executeRunMigration({
			ctx,
			logger,
			payload,
			runChunk: (chunkPayload) =>
				runMigrationChunkTask
					.triggerAndWait(chunkPayload, {
						idempotencyKey: `migration-chunk:${chunkPayload.migrationRunId}:${chunkPayload.chunkIndex}`,
						idempotencyKeyTTL: "7d",
					})
					.unwrap(),
		});
	},
});
