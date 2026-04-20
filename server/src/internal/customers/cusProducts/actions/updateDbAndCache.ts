import type { InsertCustomerProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerProductV2 } from "../../cache/fullSubject/actions/updateCachedCustomerProduct.js";
import { CusProductService } from "../CusProductService.js";

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

	await Promise.all([
		updateCachedCustomerProductV2({
			ctx,
			customerId,
			customerProductId: cusProductId,
			updates,
		}),
	]);
};
