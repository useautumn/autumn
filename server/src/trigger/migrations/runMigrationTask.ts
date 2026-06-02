import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import { withMigrationRunTracking } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { RETRYABLE_MIGRATION_ITEM_RUN_STATUSES } from "@/internal/migrations/v2/run/utils/retryItemStatuses.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const ControlsSchema = z
	.object({
		limit: z.number().int().min(1).optional(),
		only: z.array(z.string()).optional(),
		concurrency: z.number().int().min(1).optional(),
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

export const runMigrationTaskQueue = {
	concurrencyLimit: 1,
};

export const runMigrationTask = task({
	id: "run-migration",
	queue: runMigrationTaskQueue,
	machine: "medium-1x",
	maxDuration: 3600,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const {
			orgId,
			env,
			migrationId,
			migrationRunId,
			dryRun,
			lazyRun,
			controls,
		} = PayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId,
			env,
			triggerCtx,
		});

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
				concurrency: controls?.concurrency,
				retryItemStatuses: controls?.retryItemStatuses,
			},
		});

		try {
			await withMigrationRunTracking({
				ctx,
				migrationRunId,
				run: async () => {
					const migration = await migrationRepo.find({ ctx, id: migrationId });

					// Default concurrency: 10 normally, 25 when no_billing_changes
					// because we're not hitting Stripe per customer. Caller can still
					// override via controls.concurrency.
					const defaultConcurrency =
						migration.no_billing_changes === true ? 25 : 10;
					const effectiveControls = {
						...(controls ?? {}),
						concurrency: controls?.concurrency ?? defaultConcurrency,
					};

					logger.info("run-migration: resolved controls", {
						data: {
							migrationRunId,
							noBillingChanges: migration.no_billing_changes === true,
							concurrency: effectiveControls.concurrency,
							concurrencyExplicit: controls?.concurrency !== undefined,
						},
					});

					await runMigration({
						ctx,
						migration,
						dryRun,
						migrationRunId,
						controls: effectiveControls,
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
	},
});
