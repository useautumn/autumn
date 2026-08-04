import type { FullCusProduct } from "@autumn/shared";
import { getFromMiscRedisTargets } from "@/external/redis/miscCache/getFromMiscRedisTargets.js";
import { setOnMiscRedisTargets } from "@/external/redis/miscCache/setOnMiscRedisTargets.js";

/** Cross-request handoff (subscription.deleted writes, invoice.created reads),
 *  so it dual-writes and reads from every live instance during a ramp. */
const EXPIRED_CUSTOMER_PRODUCTS_TTL_SECONDS = 300;

export const buildExpiredCustomerProductsCacheKey = (
	stripeSubscriptionId: string,
) => `expired-cus-products:${stripeSubscriptionId}`;

export const getCachedExpiredCustomerProducts = async ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> => {
	const cached = await getFromMiscRedisTargets({
		key: buildExpiredCustomerProductsCacheKey(stripeSubscriptionId),
		source: "expired-cus-products-cache:get",
	});
	if (!cached) return null;

	return JSON.parse(cached) as FullCusProduct[];
};

export const setCachedExpiredCustomerProducts = async ({
	stripeSubscriptionId,
	customerProducts,
}: {
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): Promise<void> => {
	await setOnMiscRedisTargets({
		key: buildExpiredCustomerProductsCacheKey(stripeSubscriptionId),
		value: JSON.stringify(customerProducts),
		ttlMs: EXPIRED_CUSTOMER_PRODUCTS_TTL_SECONDS * 1000,
		source: "expired-cus-products-cache:set",
	});
};
