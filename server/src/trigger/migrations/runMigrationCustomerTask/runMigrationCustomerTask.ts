import { task } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { withMigrationItemTracking } from "@/internal/migrations/v2/actions/migrationItem/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";
import { LAZY_MIGRATION_RUNS_DISABLED } from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";
import { migrationTaskQueue } from "@/trigger/migrations/migrationTaskQueue.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";
import {
	type RunMigrationCustomerPayload,
	RunMigrationCustomerPayloadSchema,
} from "./runMigrationCustomerPayload.js";

const LAZY_MIGRATION_CUSTOMER_LOCK_MAX_WAIT_MS = 2 * 60 * 1000;

export type { RunMigrationCustomerPayload } from "./runMigrationCustomerPayload.js";

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
	const {
		migrationInternalId,
		migrationRunId,
		customerInternalId,
		customerId,
	} = payload;

	// Backstop for tasks queued before the kill-switch: never migrate.
	if (LAZY_MIGRATION_RUNS_DISABLED) {
		logger.info("run-migration-customer: skipping, lazy runs disabled", {
			data: { migrationInternalId, migrationRunId, customerInternalId },
		});
		return;
	}

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
				migrationCustomerLockMaxWaitMs:
					LAZY_MIGRATION_CUSTOMER_LOCK_MAX_WAIT_MS,
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

/** Lazy customer work shares fleet capacity; the item claim remains the duplicate authority. */
export const runMigrationCustomerTask = task({
	id: "run-migration-customer",
	queue: migrationTaskQueue,
	maxDuration: 600,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunMigrationCustomerPayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
			customerId: payload.customerId ?? payload.customerInternalId,
		});

		await executeRunMigrationCustomer({ ctx, logger, payload });
	},
});
