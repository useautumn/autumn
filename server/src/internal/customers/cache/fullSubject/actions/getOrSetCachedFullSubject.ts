import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
	normalizedToFullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { setCachedFullSubject } from "./setCachedFullSubject.js";

export const getOrSetCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const fetchTimeMs = Date.now();

	if (!skipCache) {
		const cached = await getCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source,
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

	return normalizedToFullSubject({ normalized });
};
