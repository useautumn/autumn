import { orgToFeaturesByOrgEnv } from "@autumn/shared";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";

const MIGRATION_INVALIDATE_MAX_ATTEMPTS = 5;
const MIGRATION_REDIS_COMMAND_TIMEOUT_MS = 10_000;

export const invalidateBatchMigrationCaches = async ({
	ctx,
	pageResult,
	includeSkipped = false,
}: {
	ctx: AutumnContext;
	pageResult: BatchMigrationPageResult;
	includeSkipped?: boolean;
}): Promise<number> => {
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
		commandTimeoutMs: MIGRATION_REDIS_COMMAND_TIMEOUT_MS,
		phases,
		throwWhenExhausted: true,
		logger: ctx.logger,
	});

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
