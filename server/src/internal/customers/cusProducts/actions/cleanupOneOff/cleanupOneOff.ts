import type { CronContext } from "@/cron/utils/CronContext.js";
import { expireOneOffCustomerProductResults } from "../expireOneOffCustomerProductResults.js";
import { logOneOffCustomerProductResults } from "../logOneOffCustomerProductResults.js";
import type { OneOffCustomerProductResult } from "../oneOffCustomerProductResult.js";
import { getOneOffCustomerProductsToCleanup } from "./getOneOffToCleanup.js";

export type CleanupOneOffResult = {
	cleanedUp: number;
	results: OneOffCustomerProductResult[];
};

/**
 * Cleanup one-off customer products by expiring those that:
 * 1. Have all one_off interval prices
 * 2. Have all entitlements either boolean or depleted (balance=0, usage_allowed=false)
 *    and a newer active customer product for the same product
 *
 * This prevents the FullCustomer object from growing unboundedly when
 * customers purchase one-time products multiple times.
 */
export const cleanupOneOffCustomerProducts = async ({
	ctx,
}: {
	ctx: CronContext;
}): Promise<CleanupOneOffResult> => {
	const { logger } = ctx;

	// 1. Get customer products eligible for cleanup
	const toCleanup = await getOneOffCustomerProductsToCleanup({ ctx });

	if (toCleanup.length === 0) {
		logger.info("[One-off Cleanup] No customer products to cleanup");
		return { cleanedUp: 0, results: [] };
	}

	// 2. Log what we're about to cleanup
	logOneOffCustomerProductResults({
		logger,
		results: toCleanup,
		label: "One-off Cleanup",
	});

	const cleanedUp = await expireOneOffCustomerProductResults({
		ctx,
		results: toCleanup,
		source: "cleanupOneOffCustomerProducts",
	});

	return {
		cleanedUp,
		results: toCleanup,
	};
};
