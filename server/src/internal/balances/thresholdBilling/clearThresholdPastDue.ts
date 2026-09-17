import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerProductV2 } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerProduct.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { isThresholdBillingPrice } from "./isThresholdBillingPrice.js";

/**
 * Settling a threshold invoice lifts the usage block it caused. The cached
 * subject is what check reads, so a Postgres-only update leaves it blocked.
 */
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

	if (blockedProducts.length === 0) return;

	for (const customerProduct of blockedProducts) {
		await customerProductActions.markActive({
			ctx,
			customerProduct,
			fullCustomer,
		});
		await updateCachedCustomerProductV2({
			ctx,
			customerId,
			customerProductId: customerProduct.id,
			updates: { status: CusProductStatus.Active },
		});
	}

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "threshold-billing-recovered",
	});
};
