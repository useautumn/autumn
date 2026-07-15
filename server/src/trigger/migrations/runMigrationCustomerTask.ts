import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { withMigrationItemTracking } from "@/internal/migrations/v2/actions/migrationItem/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";
import { isMigrationCancelRequested } from "@/internal/migrations/v2/run/utils/migrationCancelToken.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const PayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationInternalId: z.string(),
	migrationRunId: z.string(),
	customerInternalId: z.string(),
	customerId: z.string().nullable(),
});

export type RunMigrationCustomerPayload = z.infer<typeof PayloadSchema>;

/** Shared workload for the trigger.dev task and the local inline fallback. */
export const executeRunMigrationCustomer = async ({
	ctx,
	logger,
	payload,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunMigrationCustomerPayload;
}) => {
	const { migrationInternalId, migrationRunId, customerInternalId, customerId } =
		payload;

	await warmupRegionalRedis().catch((error) => {
		logger.warn("run-migration-customer: redis warmup failed (continuing)", {
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
	});

	logger.info("run-migration-customer: starting", {
		data: { migrationInternalId, migrationRunId, customerInternalId },
	});

	if (await isMigrationCancelRequested({ migrationRunId })) {
		logger.info("run-migration-customer: skipping, cancel requested", {
			data: { migrationInternalId, migrationRunId, customerInternalId },
		});
		return;
	}

	const migration = await migrationRepo.find({
		ctx,
		internalId: migrationInternalId,
	});

	await withMigrationItemTracking({
		ctx,
		migrationInternalId,
		migrationRunId,
		item: {
			kind: "customer",
			internal_id: customerInternalId,
			id: customerId,
		},
		dryRun: false,
		claimItemRun: true,
		run: async () => {
			// Bust the customer cache as soon as we own the claim so in-flight
			// reads load fresh state and see the `running` item_run.
			// `deleteCachedFullCustomer` also invalidates the FullSubject cache.
			const cacheKey = customerId ?? customerInternalId;
			await deleteCachedFullCustomer({
				ctx,
				customerId: cacheKey,
				source: "runMigrationCustomerTask",
			});

			const result = await migrateCustomer({
				ctx,
				customerId: cacheKey,
				migration,
			});

			return {
				itemPreview: {
					id: customerId,
					name: null,
					email: null,
				},
				status: result.status,
				response: result.response,
			};
		},
	});

	logger.info("run-migration-customer: done", {
		data: { migrationInternalId, customerInternalId },
	});
};

/**
 * Per-customer lazy migration task. Enqueued by `checkPendingMigrationsForCustomer`
 * on the customer-fetch path. Claims the `migration_item_runs` row, busts the
 * customer cache, then runs `migrateCustomer` under the existing tracking machinery.
 *
 * Trigger.dev's `concurrencyKey` (set at enqueue time) serializes parallel
 * requests for the same customer + migration; the server-side claim is the
 * real authority if another worker raced ahead.
 */
export const runMigrationCustomerTask = task({
	id: "run-migration-customer",
	maxDuration: 600,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = PayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
			customerId: payload.customerId ?? payload.customerInternalId,
		});

		await executeRunMigrationCustomer({ ctx, logger, payload });
	},
});
