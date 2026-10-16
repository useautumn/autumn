import { orgToFeaturesByOrgEnv } from "@autumn/shared";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "../execute/types/batchMigrationExecutionTypes.js";

const workerCurrentCustomerIdsOf = ({
	pageResult,
}: {
	pageResult: BatchMigrationPageResult;
}): Set<string> => {
	const workerCurrentIds = new Set(pageResult.workerCurrentInternalIds ?? []);
	return new Set(
		[...pageResult.succeeded, ...(pageResult.failed ?? [])]
			.map(({ internalId }) => internalId)
			.filter((internalId) => workerCurrentIds.has(internalId)),
	);
};

/** Migration writes are already committed when this runs, so a dropped
 *  invalidation is unrecoverable staleness rather than a retryable request. */
const MIGRATION_INVALIDATE_MAX_ATTEMPTS = 5;
const MIGRATION_REDIS_COMMAND_TIMEOUT_MS = 10_000;

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
	const customers = [
		...pageResult.succeeded,
		...(includeSkipped ? pageResult.skipped : []),
		...(pageResult.failed ?? []),
	];
	const workerCurrentIds = workerCurrentCustomerIdsOf({ pageResult });
	const toInvalidated = (customer: BatchMigrationPageCustomer) => ({
		customerId: customer.id ?? customer.internalId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const phases: Record<string, number> = {};
	const startedAt = Date.now();

	const invalidated = await batchInvalidateCachedFullSubjects({
		customers: customers.map(toInvalidated),
		workerEvictCustomers: customers
			.filter(({ internalId }) => !workerCurrentIds.has(internalId))
			.map(toInvalidated),
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
			workerCurrent: workerCurrentIds.size,
			includeSkipped,
			totalMs: Date.now() - startedAt,
			...phases,
		},
	});
	return invalidated;
};
