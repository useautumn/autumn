import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	buildFullSubjectCacheKey,
	FULL_SUBJECT_CACHE_GUARD_TTL_SECONDS,
} from "./fullSubjectCacheConfig.js";

/**
 * Delete FullSubject from Redis cache across ALL regions.
 * Routes key based on entityId presence.
 */
export const deleteCachedFullSubject = async ({
	customerId,
	entityId,
	ctx,
	source,
	skipGuard = false,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	skipGuard?: boolean;
}): Promise<void> => {
	const { org, env, logger } = ctx;

	if (redis.status !== "ready" || !customerId) return;

	const cacheKey = buildFullSubjectCacheKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const regions = getConfiguredRegions();
	const guardTimestamp = Date.now().toString();
	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;

	const deletePromises = regions.map(async (region) => {
		try {
			const regionalRedis = getRegionalRedis(region);

			if (regionalRedis.status !== "ready") {
				logger.warn(`[deleteCachedFullSubject] ${region}: not_ready`);
				return;
			}

			const result = await regionalRedis.deleteFullCustomerCache(
				cacheKey,
				org.id,
				env,
				customerId,
				guardTimestamp,
				FULL_SUBJECT_CACHE_GUARD_TTL_SECONDS.toString(),
				skipGuard.toString(),
			);

			logger.info(
				`[deleteCachedFullSubject] ${region}: ${result}, subject: ${subjectLabel}, source: ${source}`,
			);
		} catch (error) {
			logger.error(
				`[deleteCachedFullSubject] ${region}: error, subject: ${subjectLabel}, source: ${source}, error: ${error}`,
			);
		}
	});

	await Promise.all(deletePromises);
};
