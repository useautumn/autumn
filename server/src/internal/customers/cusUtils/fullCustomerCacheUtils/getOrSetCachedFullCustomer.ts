import {
	type AppEnv,
	CusExpand,
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "../../CusService.js";
import { getCachedFullCustomer } from "./getCachedFullCustomer.js";
import { setCachedFullCustomer } from "./setCachedFullCustomer.js";

/**
 * Get FullCustomer from Redis cache, or fetch from DB and set cache if not found
 * Throws CustomerNotFoundError if customer doesn't exist
 */
export const getOrSetCachedFullCustomer = async ({
	ctx,
	customerId,
	entityId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
}): Promise<FullCustomer> => {
	const { org, env, db, skipCache, logger } = ctx;

	// 1. Try cache first
	if (!skipCache) {
		const cached = await getCachedFullCustomer({
			orgId: org.id,
			env,
			customerId,
		});

		if (cached) {
			logger.debug(
				`[getOrSetCachedFullCustomer] Cache hit for ${customerId}, source: ${source}`,
			);

			// Set entity if entityId is provided, otherwise clear it
			if (entityId) {
				cached.entity = cached.entities?.find((e) => e.id === entityId);
				if (!cached.entity) {
					throw new EntityNotFoundError({ entityId });
				}
			} else {
				// Clear entity from cache hit - customer GET should not have entity set
				cached.entity = undefined;
			}

			return cached;
		}
	}

	// 2. Cache miss - fetch from DB
	logger.debug(
		`[getOrSetCachedFullCustomer] Cache miss for ${customerId}, fetching from DB, source: ${source}`,
	);

	const fetchTimeMs = Date.now();

	const fullCustomer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env: env as AppEnv,
		withEntities: true,
		withSubs: true,
		expand: [CusExpand.Invoices],
	});

	if (!fullCustomer) {
		throw new CustomerNotFoundError({ customerId });
	}

	if (entityId) {
		fullCustomer.entity = fullCustomer.entities?.find((e) => e.id === entityId);
		if (!fullCustomer.entity) {
			throw new EntityNotFoundError({ entityId });
		}
	}

	// 3. Set cache (fire and forget)
	if (!skipCache) {
		await setCachedFullCustomer({
			ctx,
			fullCustomer,
			customerId,
			fetchTimeMs,
			source,
		});

		// .catch((error) => {
		// 	logger.error(
		// 		`[getOrSetCachedFullCustomer] Failed to set cache: ${error}`,
		// 	);
		// });
	}

	return fullCustomer;
};
