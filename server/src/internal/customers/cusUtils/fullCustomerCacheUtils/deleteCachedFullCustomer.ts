import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { buildPathIndexKey } from "@/internal/customers/cache/pathIndex/pathIndexConfig.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";
import { buildTestFullCustomerCacheGuardKey } from "./testFullCustomerCacheGuard.js";

/** Delete only the legacy FullCustomer view across all regions. */
export const deleteLegacyCachedFullCustomer = async ({
	ctx,
	customerId,
	entityId,
	source,
	skipGuard = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	skipGuard?: boolean;
}): Promise<void> => {
	const { org, env, logger } = ctx;

	if (!customerId) return;

	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});
	const regions = getConfiguredRegions();
	const guardTimestamp = Date.now().toString();
	const customerLabel = entityId ? `${customerId}:${entityId}` : customerId;

	if (redis.status !== "ready") {
		logger.warn(
			`[deleteCachedFullCustomer] primary redis not_ready, skipping fullCustomer invalidation for ${customerLabel}`,
		);
		return;
	}

	// Delete from all regions in parallel
	const deletePromises = regions.map(async (region) => {
		try {
			const regionalRedis = getRegionalRedis(region);

			if (regionalRedis.status !== "ready") {
				logger.warn(`[deleteCachedFullCustomer] ${region}: not_ready`);
				return;
			}

			const testGuardKey = buildTestFullCustomerCacheGuardKey({
				orgId: org.id,
				env,
				customerId,
			});
			const guardKey = buildFullCustomerCacheGuardKey({
				orgId: org.id,
				env,
				customerId,
			});
			const pathIndexKey = buildPathIndexKey({
				orgId: org.id,
				env,
				customerId,
			});

			const result = await regionalRedis.deleteFullCustomerCache(
				cacheKey,
				testGuardKey,
				guardKey,
				pathIndexKey,
				guardTimestamp,
				FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS.toString(),
				skipGuard.toString(),
			);

			logger.info(
				`[deleteCachedFullCustomer] ${region}: ${result}, customer: ${customerLabel}, source: ${source}`,
			);
		} catch (error) {
			logger.error(
				`[deleteCachedFullCustomer] ${region}: error, customer: ${customerLabel}, source: ${source}, error: ${error}`,
			);
		}
	});

	await Promise.all(deletePromises);
};

/**
 * Delete FullCustomer and FullSubject cache views.
 * @param skipGuard - If true, skips setting the legacy guard key. Default false.
 */
export const deleteCachedFullCustomer = async ({
	ctx,
	customerId,
	entityId,
	source,
	skipGuard = false,
	flushBalances = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	skipGuard?: boolean;
	flushBalances?: boolean;
}): Promise<void> => {
	if (!customerId) return;

	const invalidateAllViews = async ({
		balanceSyncDb,
	}: {
		balanceSyncDb?: Parameters<
			typeof invalidateCachedFullSubject
		>[0]["balanceSyncDb"];
	}) => {
		await Promise.all([
			invalidateCachedFullSubject({
				ctx,
				customerId,
				entityId,
				source,
				flushBalances,
				balanceSyncDb,
			}),
			deleteLegacyCachedFullCustomer({
				ctx,
				customerId,
				entityId,
				source,
				skipGuard,
			}),
		]);
	};

	if (!flushBalances) {
		await invalidateAllViews({});
		return;
	}

	await withCustomerBalanceSyncLock({
		ctx,
		customerId,
		callback: ({ db }) => invalidateAllViews({ balanceSyncDb: db }),
	});
};
