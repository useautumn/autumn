import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { rebuildFullSubjectCacheAfterMiss } from "./rebuildFullSubjectCacheAfterMiss.js";

export const getOrSetCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
	staleWhileRevalidate = true,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	staleWhileRevalidate?: boolean;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const useRedis = !skipCache;

	if (useRedis) {
		const { fullSubject: cached } = await getCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source,
			staleWhileRevalidate,
		});
		if (cached) {
			logger.debug(
				`[getOrSetCachedFullSubject] Subject hit for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
			);
			return cached;
		}
	}

	logger.debug(
		`[getOrSetCachedFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
	);

	if (!useRedis) {
		const result = await getFullSubjectNormalized({
			ctx,
			customerId,
			entityId,
		});
		if (result) return result.fullSubject;
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	return rebuildFullSubjectCacheAfterMiss({
		ctx,
		customerId,
		entityId,
		source,
		readCachedSubject: ({ balanceSyncDb, source: cacheReadSource }) =>
			getCachedFullSubject({
				ctx,
				customerId,
				entityId,
				source: cacheReadSource,
				staleWhileRevalidate,
				balanceSyncDb,
			}),
	});
};
