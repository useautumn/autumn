import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
	normalizedToFullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterNormalizedFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { setCachedFullSubject } from "../setCachedFullSubject.js";
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
	const fetchTimeMs = Date.now();

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

	const normalized = await getFullSubjectNormalized({
		ctx,
		customerId,
		entityId,
	});

	if (!normalized) {
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	if (!skipCache) {
		await setCachedFullSubject({ ctx, normalized, fetchTimeMs });
	}

	return normalizedToFullSubject({
		normalized: filterNormalizedFullSubjectByFeatureIds({
			normalized,
			featureIds,
		}),
	});
};
