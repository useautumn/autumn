import type { FullCusProduct } from "@autumn/shared";
import { getFromMiscRedisTargets } from "@/external/redis/miscCache/getFromMiscRedisTargets.js";
import { setOnMiscRedisTargets } from "@/external/redis/miscCache/setOnMiscRedisTargets.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Cross-request handoff (subscription.deleted writes, invoice.created reads),
 *  so it dual-writes and reads from every live instance during a ramp. */
const EXPIRED_CUSTOMER_PRODUCTS_TTL_SECONDS = 300;

export const buildExpiredCustomerProductsCacheKey = (
	stripeSubscriptionId: string,
) => `expired-cus-products:${stripeSubscriptionId}`;

export const getCachedExpiredCustomerProducts = async ({
	ctx,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
}): Promise<FullCusProduct[] | null> => {
	const cached = await getFromMiscRedisTargets({
		key: buildExpiredCustomerProductsCacheKey(stripeSubscriptionId),
		source: "expired-cus-products-cache:get",
		onError: (error) =>
			ctx.logger.warn("[expiredCusProductsCache] get failed", {
				data: { stripeSubscriptionId },
				error,
			}),
	});
	if (!cached) return null;

	return JSON.parse(cached) as FullCusProduct[];
};

export const setCachedExpiredCustomerProducts = async ({
	ctx,
	stripeSubscriptionId,
	customerProducts,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
	customerProducts: FullCusProduct[];
}): Promise<void> => {
	await setOnMiscRedisTargets({
		key: buildExpiredCustomerProductsCacheKey(stripeSubscriptionId),
		value: JSON.stringify(customerProducts),
		ttlMs: EXPIRED_CUSTOMER_PRODUCTS_TTL_SECONDS * 1000,
		source: "expired-cus-products-cache:set",
		onError: (error) =>
			ctx.logger.warn("[expiredCusProductsCache] set failed", {
				data: { stripeSubscriptionId },
				error,
			}),
	});
};
