import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withMigrationRunTracking } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigration } from "@/internal/migrations/v2/run/runMigration.js";
import type { MigrationRunScheduler } from "@/internal/migrations/v2/run/types/migrationRunScheduler.js";
import { RETRYABLE_MIGRATION_ITEM_RUN_STATUSES } from "@/internal/migrations/v2/run/utils/retryItemStatuses.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import {
	createMigrationTaskScheduler,
	MIGRATION_CUSTOMER_CONCURRENCY,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const ControlsSchema = z
	.object({
		limit: z.number().int().min(1).optional(),
		only: z.array(z.string()).optional(),
		retryItemStatuses: z
			.array(z.enum(RETRYABLE_MIGRATION_ITEM_RUN_STATUSES))
			.optional(),
	})
	.optional();

const PayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationId: z.string(),
	migrationRunId: z.string(),
	dryRun: z.boolean().default(false),
	lazyRun: z.boolean().default(false),
	controls: ControlsSchema,
});

export type RunMigrationPayload = z.infer<typeof PayloadSchema>;

/** Shared workload for the trigger.dev task and the local inline fallback. */
export const executeRunMigration = async ({
	ctx,
	logger,
	payload,
	scheduler,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunMigrationPayload;
	scheduler?: MigrationRunScheduler;
}) => {
	const { orgId, env, migrationId, migrationRunId, dryRun, lazyRun, controls } =
		payload;

	// Trigger.dev tasks start with cold Redis connections — wait for
	// readiness before touching the migration so cache invalidations
	// (deleteCachedFullCustomer, invalidateSharedBalanceFields,
	// invalidateCachedFullSubject) actually fire instead of being
	// short-circuited by the `not_ready` availability gate.
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

				const effectiveControls = {
					...(controls ?? {}),
					concurrency: MIGRATION_CUSTOMER_CONCURRENCY,
				};

				logger.info("run-migration: resolved controls", {
					data: {
						migrationRunId,
						noBillingChanges: migration.no_billing_changes === true,
						concurrency: effectiveControls.concurrency,
					},
				});

				await runMigration({
					ctx,
					migration,
					dryRun,
					migrationRunId,
					controls: effectiveControls,
					scheduler,
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
	queue: migrationTaskQueue,
	machine: "medium-1x",
	// Trigger.dev has no true "disable" — set very high to effectively remove the timeout.
	maxDuration: 86400,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = PayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		await executeRunMigration({
			ctx,
			logger,
			payload,
			scheduler: createMigrationTaskScheduler({ logger }),
		});
	},
});
