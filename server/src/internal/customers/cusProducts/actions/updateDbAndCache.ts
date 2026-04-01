import type { InsertCustomerProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { CusProductService } from "../CusProductService.js";
import { updateCachedCustomerProduct } from "./cache/updateCachedCustomerProduct.js";

/**
 * Updates a customer product in both Postgres and the Redis FullCustomer cache.
 *
 * If the Lua atomic patch finds a cache_miss (e.g. because a concurrent Stripe
 * webhook deleted the key mid-flight), we fall back to a full DB fetch and
 * re-populate the cache before returning. This ensures the cache is warm and
 * correct before the 200 response goes out, preventing stale reads immediately
 * after the update.
 */
export const updateCustomerProductDbAndCache = async ({
	ctx,
	customerId,
	cusProductId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	cusProductId: string;
	updates: Partial<InsertCustomerProduct>;
}) => {
	await CusProductService.update({
		ctx,
		cusProductId,
		updates,
	});

	const result = await updateCachedCustomerProduct({
		ctx,
		customerId,
		cusProductId,
		updates,
	});

	if (result?.error === "cache_miss") {
		ctx.logger.info(
			`[updateCustomerProductDbAndCache] cache_miss for cusProduct ${cusProductId}, rebuilding cache from DB`,
		);
		await getOrSetCachedFullCustomer({
			ctx,
			customerId,
			source: "updateDbAndCache:cache_miss_fallback",
		});
	}
};
