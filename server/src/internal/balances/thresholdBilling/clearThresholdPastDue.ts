import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyThresholdBlock } from "./applyThresholdBlock.js";
import { isThresholdBillingPrice } from "./isThresholdBillingPrice.js";

export const clearThresholdPastDue = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<void> => {
	const customerId = fullCustomer.id;
	if (!customerId) return;

	const blockedProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.PastDue &&
			customerProduct.customer_prices.some((customerPrice) =>
				isThresholdBillingPrice({ price: customerPrice.price }),
			),
	);

	await applyThresholdBlock({
		ctx,
		customerId,
		customerProducts: blockedProducts,
		fullCustomer,
		status: CusProductStatus.Active,
		source: "threshold-billing-recovered",
	});
};
