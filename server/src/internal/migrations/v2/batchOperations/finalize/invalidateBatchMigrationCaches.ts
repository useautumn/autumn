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
}: {
	ctx: AutumnContext;
	pageResult: BatchMigrationPageResult;
}): Promise<number> =>
	batchInvalidateCachedFullSubjects({
		customers: pageResult.succeeded.map((customer) => ({
			customerId: customer.id ?? customer.internalId,
			orgId: ctx.org.id,
			env: ctx.env,
		})),
		featuresByOrgEnv: orgToFeaturesByOrgEnv({
			org: ctx.org,
			env: ctx.env,
			features: ctx.features,
		}),
		getRedisTargetsForCustomer: () =>
			getRedisTargetsForCustomer({ org: ctx.org }),
		maxAttempts: MIGRATION_INVALIDATE_MAX_ATTEMPTS,
	});
