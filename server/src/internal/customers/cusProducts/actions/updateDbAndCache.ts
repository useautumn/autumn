import type { InsertCustomerProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProductService } from "../CusProductService.js";
import { updateCachedCustomerProduct } from "./cache/updateCachedCustomerProduct.js";

/**
 * Updates a customer product in both Postgres and the Redis FullCustomer cache.
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
	const result = await CusProductService.update({
		ctx,
		cusProductId,
		updates,
	});

	await updateCachedCustomerProduct({
		ctx,
		customerId,
		cusProductId,
		updates,
	});

	return result;
};
