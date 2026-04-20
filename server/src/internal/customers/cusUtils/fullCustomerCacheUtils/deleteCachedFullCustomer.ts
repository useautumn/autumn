import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";

/**
 * Delete FullCustomer from Redis cache across ALL regions.
 * @param skipGuard - If true, skips setting the guard key. Default false (guard is set). Use skipGuard: true when deleting cache before a fresh Postgres read.
 */
export const deleteCachedFullCustomer = async ({
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

	const invalidationPromises: Promise<void>[] = [
		invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source,
		}),
	];

	if (redis.status !== "ready") {
		logger.warn(
			`[deleteCachedFullCustomer] primary redis not_ready, skipping fullCustomer invalidation for ${customerLabel}`,
		);
		await Promise.all(invalidationPromises);
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

			const result = await regionalRedis.deleteFullCustomerCache(
				cacheKey,
				org.id,
				env,
				customerId,
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

	await Promise.all([...deletePromises, ...invalidationPromises]);
};
