import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { batchUpdateCustomerProducts } from "../../repos/batchUpdateCustomerProducts.js";
import {
	getOneOffCustomerProductsToCleanup,
	type OneOffCleanupResult,
} from "./getOneOffToCleanup.js";
import { logOneOffCleanup } from "./logOneOffCleanup.js";

export type CleanupOneOffResult = {
	cleanedUp: number;
	results: OneOffCleanupResult[];
};

/**
 * Cleanup one-off customer products by expiring those that:
 * 1. Have all one_off interval prices
 * 2. Have all entitlements either boolean or depleted (balance=0, usage_allowed=false)
 * 3. Have a newer active customer product for the same product
 *
 * This prevents the FullCustomer object from growing unboundedly when
 * customers purchase one-time products multiple times.
 */
export const cleanupOneOffCustomerProducts = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<CleanupOneOffResult> => {
	const { logger } = ctx;

	// 1. Get customer products eligible for cleanup
	const toCleanup = await getOneOffCustomerProductsToCleanup({ ctx });

	if (toCleanup.length === 0) {
		logger.info("[One-off Cleanup] No customer products to cleanup");
		return { cleanedUp: 0, results: [] };
	}

	// 2. Log what we're about to cleanup
	logOneOffCleanup({ logger, cleanupResults: toCleanup });

	// 3. Batch update status to 'expired'
	// Get unique customer product IDs (query may return duplicates due to JOINs)
	const uniqueIds = Array.from(
		new Set(toCleanup.map((item) => item.customer_product.id)),
	);

	await batchUpdateCustomerProducts({
		ctx,
		updates: uniqueIds.map((id) => ({
			id,
			updates: { status: CusProductStatus.Expired },
		})),
	});

	// 4. Invalidate cache for affected customers
	// Get unique customer IDs
	const uniqueCustomerIds = Array.from(
		new Set(toCleanup.map((item) => item.customer.id).filter(Boolean)),
	) as string[];

	const cacheInvalidationPromises = uniqueCustomerIds.map((customerId) =>
		deleteCachedFullCustomer({
			customerId,
			ctx,
			source: "cleanupOneOffCustomerProducts",
		}),
	);

	await Promise.all(cacheInvalidationPromises);

	return {
		cleanedUp: uniqueIds.length,
		results: toCleanup,
	};
};
