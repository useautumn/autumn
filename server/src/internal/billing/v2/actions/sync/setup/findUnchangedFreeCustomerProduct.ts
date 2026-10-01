import {
	ACTIVE_STATUSES,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductUnlinkedFree,
	isFreeProduct,
	type SyncProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isUnchangedCustomerProduct } from "@/internal/billing/v2/actions/setPlans/utils/isUnchangedCustomerProduct";

/** The customer-wide free plan a synced plan repeats exactly, which sync then
 * leaves in place instead of re-inserting onto the subscription. */
export const findUnchangedFreeCustomerProduct = ({
	ctx,
	fullCustomer,
	productContext,
	claimedCustomerProductIds,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	productContext: SyncProductContext;
	claimedCustomerProductIds: Set<string>;
}): FullCusProduct | undefined => {
	if (!isFreeProduct({ product: productContext.fullProduct })) return undefined;

	return fullCustomer.customer_products.find(
		(customerProduct) =>
			!claimedCustomerProductIds.has(customerProduct.id) &&
			ACTIVE_STATUSES.includes(customerProduct.status) &&
			isCustomerProductUnlinkedFree(customerProduct) &&
			isUnchangedCustomerProduct({
				ctx,
				customerProduct,
				productContext,
				internalEntityId: productContext.entity?.internal_id,
			}),
	);
};
