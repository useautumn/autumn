import { orgToFeaturesByOrgEnv } from "@autumn/shared";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";

/**
 * Busts caches for the page's mutated customers — skipped customers received
 * no writes. Covers fullCustomer plus the FullSubject keys (subject manifest,
 * shared balances, view epoch); redis failures fail open inside.
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
	});
