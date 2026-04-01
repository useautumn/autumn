import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { setCachedFullSubject } from "./setCachedFullSubject.js";

/**
 * Get FullSubject from Redis cache, or fetch from DB and set cache if not found.
 * Throws CustomerNotFoundError / EntityNotFoundError if subject doesn't exist.
 */
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

	if (!skipCache) {
		const cached = await getCachedFullSubject({
			ctx,
			customerId,
			entityId,
		});

		if (cached) {
			logger.debug(
				`[getOrSetCachedFullSubject] Cache hit for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
			);
			return cached;
		}
	}

	logger.debug(
		`[getOrSetCachedFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
	);

	const fetchTimeMs = Date.now();

	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		entityId,
	});

	if (!fullSubject) {
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	if (!skipCache) {
		await setCachedFullSubject({
			ctx,
			fullSubject,
			fetchTimeMs,
			source,
		});
	}

	return fullSubject;
};
