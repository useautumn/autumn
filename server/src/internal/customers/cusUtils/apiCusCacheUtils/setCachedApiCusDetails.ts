import type { ApiCustomer, FullCustomer } from "@autumn/shared";
import { SET_CUSTOMER_DETAILS_SCRIPT } from "@lua/luaScripts.js";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";

/**
 * Update customer detail fields in Redis cache if key exists
 * Returns true if cache was updated, false if cache key doesn't exist
 */
export const setCachedApiCusDetails = async ({
	ctx,
	customer,
	updates,
}: {
	ctx: AutumnContext;
	customer: FullCustomer | ApiCustomer;
	updates: {
		name?: string;
		email?: string;
		fingerprint?: string;
		metadata?: Record<string, any>;
	};
}): Promise<boolean> => {
	const { org, env, logger } = ctx;

	const customerId = customer.id || (customer as FullCustomer).internal_id;

	let wasUpdated = false;

	// Try to update cache
	await tryRedisWrite(async () => {
		const result = await redis.eval(
			SET_CUSTOMER_DETAILS_SCRIPT,
			0, // No KEYS, all params in ARGV
			JSON.stringify(updates),
			org.id,
			env,
			customerId,
		);

		if (result === "OK") {
			wasUpdated = true;
			logger.info(
				`Updated customer details cache for customer ${customerId}`,
				updates,
			);
		} else {
			logger.info(
				`Customer cache not found for customer ${customerId}, skipping cache update`,
			);
		}
	});

	return wasUpdated;
};
