import { orgToFeaturesByOrgEnv } from "@autumn/shared";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";

/** Migration writes are already committed when this runs, so a dropped
 *  invalidation is unrecoverable staleness rather than a retryable request. */
const MIGRATION_INVALIDATE_MAX_ATTEMPTS = 5;

/**
 * Busts caches for the page's mutated customers — skipped customers received
 * no writes. Covers fullCustomer plus the FullSubject keys (subject manifest,
 * shared balances, view epoch); redis failures fail open inside after the
 * retries are spent.
 */
export const invalidateBatchMigrationCaches = async ({
	ctx,
	pageResult,
	includeSkipped = false,
}: {
	ctx: AutumnContext;
	pageResult: BatchMigrationPageResult;
	includeSkipped?: boolean;
}): Promise<number> => {
	// Org-scoped, so the per-customer callback below can return a fixed list.
	const redisTargets = getRedisTargetsForCustomer({ org: ctx.org });
	const customers = includeSkipped
		? [...pageResult.succeeded, ...pageResult.skipped]
		: pageResult.succeeded;
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
		phases,
		throwWhenExhausted: true,
	});

	// One line per page: the split says whether a future stall sat in the
	// Postgres freshness marks or in Redis.
	ctx.logger.info("batch-migration: page caches invalidated", {
		data: {
			customers: invalidated,
			includeSkipped,
			totalMs: Date.now() - startedAt,
			...phases,
		},
	});
	return invalidated;
};
