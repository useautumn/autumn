import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { rebuildFullSubjectCacheAfterMiss } from "../rebuildFullSubjectCacheAfterMiss.js";
import { getCachedPartialFullSubject } from "./getCachedPartialFullSubject.js";

export const getOrSetCachedPartialFullSubject = async ({
	ctx,
	customerId,
	entityId,
	featureIds,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
	source?: string;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const useRedis = !skipCache;

	if (useRedis) {
		const { fullSubject: cached } = await getCachedPartialFullSubject({
			ctx,
			customerId,
			entityId,
			featureIds,
			source,
		});
		if (cached) {
			logger.debug(
				`[getOrSetCachedPartialFullSubject] Subject hit for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
			);
			return cached;
		}
	}

	logger.debug(
		`[getOrSetCachedPartialFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
	);

	if (!useRedis) {
		const result = await getFullSubjectNormalized({
			ctx,
			customerId,
			entityId,
		});
		if (result) {
			return filterFullSubjectByFeatureIds({
				fullSubject: result.fullSubject,
				featureIds,
			});
		}
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	const fullSubject = await rebuildFullSubjectCacheAfterMiss({
		ctx,
		customerId,
		entityId,
		source,
		readCachedSubject: ({ balanceSyncDb, source: cacheReadSource }) =>
			getCachedPartialFullSubject({
				ctx,
				customerId,
				entityId,
				featureIds,
				source: cacheReadSource,
				balanceSyncDb,
			}),
	});

	return filterFullSubjectByFeatureIds({
		fullSubject,
		featureIds,
	});
};
