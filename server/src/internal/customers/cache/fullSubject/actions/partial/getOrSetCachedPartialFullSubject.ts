import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { getOrInitFullSubjectViewEpoch } from "../invalidate/getOrInitFullSubjectViewEpoch.js";
import { setCachedFullSubject } from "../setCachedFullSubject/setCachedFullSubject.js";
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

	if (!skipCache) {
		const cached = await getCachedPartialFullSubject({
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
	const fetchedSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});

	const result = await getFullSubjectNormalized({
		ctx,
		customerId,
		entityId,
	});

	if (!result) {
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	const { normalized, fullSubject } = result;

	if (!skipCache) {
		await setCachedFullSubject({
			ctx,
			normalized,
			fetchedSubjectViewEpoch,
		});

		// Re-read from cache instead of returning the DB-fetched fullSubject.
		// Balance hash fields use HSETNX, so in-flight Lua deduction patches
		// survive the setCachedFullSubject write. The DB data may be stale
		// (e.g. entity view rebuilt before sync completes), but the balance
		// hash reflects the true Redis state.
		const freshCached = await getCachedPartialFullSubject({
			ctx,
			customerId,
			entityId,
			featureIds,
			source: `${source}:post-set`,
		});
		if (freshCached) return freshCached;
	}

	return filterFullSubjectByFeatureIds({
		fullSubject,
		featureIds,
	});
};
