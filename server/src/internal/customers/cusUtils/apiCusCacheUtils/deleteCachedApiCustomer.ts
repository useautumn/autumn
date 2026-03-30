import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "../fullCustomerCacheUtils/deleteCachedFullCustomer.js";

/**
 * Delete all cached ApiCustomer data from Redis across ALL regions.
 * This ensures cache consistency and prevents race conditions where
 * a stale cache in another region could be read after deletion.
 */
export const deleteCachedApiCustomer = async ({
	customerId,
	ctx,
	source,
}: {
	customerId: string;
	ctx: AutumnContext;
	source?: string;
}): Promise<void> => {
	const { logger } = ctx;

	try {
		await deleteCachedFullCustomer({ ctx, customerId, source });
	} catch (error) {
		logger.error(`Error deleting customer with entities: ${error}`);
		throw error;
	}
};
