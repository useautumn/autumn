import {
	ACTIVE_STATUSES,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductUnlinkedFree,
	type SyncProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isUnchangedCustomerProduct } from "@/internal/billing/v2/actions/setPlans/utils/isUnchangedCustomerProduct";
import { isProductFreeInSyncCurrency } from "../utils/syncContextUtils";

export const findUnchangedFreeCustomerProduct = ({
	ctx,
	fullCustomer,
	productContext,
	currency,
	claimedCustomerProductIds,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	productContext: SyncProductContext;
	currency: string;
	claimedCustomerProductIds: ReadonlySet<string>;
}): FullCusProduct | undefined => {
	if (
		!isProductFreeInSyncCurrency({
			fullProduct: productContext.fullProduct,
			currency,
		})
	) {
		return undefined;
	}

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
