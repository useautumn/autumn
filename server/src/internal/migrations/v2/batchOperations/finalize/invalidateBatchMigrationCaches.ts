import { orgToFeaturesByOrgEnv } from "@autumn/shared";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import type { BatchMigrationPageCustomer } from "../execute/types/batchMigrationExecutionTypes.js";

/** Migration writes are already committed when this runs, so a dropped
 *  invalidation is unrecoverable staleness rather than a retryable request. */
const MIGRATION_INVALIDATE_MAX_ATTEMPTS = 5;
const MIGRATION_REDIS_COMMAND_TIMEOUT_MS = 10_000;

/**
 * Busts caches for customers the migration changed. Covers fullCustomer plus
 * the FullSubject keys (subject manifest, shared balances, view epoch); redis
 * failures fail open inside after the retries are spent.
 */
export const invalidateBatchMigrationCaches = async ({
	ctx,
	customers,
}: {
	ctx: AutumnContext;
	customers: BatchMigrationPageCustomer[];
}): Promise<number> => {
	if (customers.length === 0) return 0;
	// Org-scoped, so the per-customer callback below can return a fixed list.
	const redisTargets = getRedisTargetsForCustomer({ org: ctx.org });
	const phases: Record<string, number> = {};
	const startedAt = Date.now();

	const invalidated = await batchInvalidateCachedFullSubjects({
		customers: customers.map((customer) => ({
			customerId: customer.id ?? customer.internalId,
			orgId: ctx.org.id,
			env: ctx.env,
		})),
		featuresByOrgEnv: orgToFeaturesByOrgEnv({
			org: ctx.org,
			env: ctx.env,
			features: ctx.features,
		}),
		getRedisTargetsForCustomer: () => redisTargets,
		maxAttempts: MIGRATION_INVALIDATE_MAX_ATTEMPTS,
		commandTimeoutMs: MIGRATION_REDIS_COMMAND_TIMEOUT_MS,
		phases,
		throwWhenExhausted: true,
		logger: ctx.logger,
	});

	// One line per page: the split says whether a future stall sat in the
	// Postgres freshness marks or in Redis.
	ctx.logger.info("batch-migration: page caches invalidated", {
		data: {
			customers: invalidated,
			totalMs: Date.now() - startedAt,
			...phases,
		},
	});
	return invalidated;
};
