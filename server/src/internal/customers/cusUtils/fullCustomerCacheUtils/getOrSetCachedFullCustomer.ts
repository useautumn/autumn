import {
	type AppEnv,
	CusExpand,
	CustomerNotFoundError,
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
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
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

	// 3. Set cache (fire and forget)
	if (!skipCache) {
		setCachedFullCustomer({
			ctx,
			fullCustomer,
			customerId,
			fetchTimeMs,
			source,
		}).catch((error) => {
			logger.error(
				`[getOrSetCachedFullCustomer] Failed to set cache: ${error}`,
			);
		});
	}

	return fullCustomer;
};
