import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerProductV2 } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerProduct.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

/**
 * Blocks further usage once a settlement fails to collect. check reads the
 * cached subject, so a Postgres-only update leaves the customer unblocked.
 */
export const markThresholdPastDue = async ({
	ctx,
	customerId,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<void> => {
	if (customerProduct.product.config?.ignore_past_due) return;

	await customerProductActions.markPastDue({
		ctx,
		customerProduct,
		fullCustomer,
	});
	await updateCachedCustomerProductV2({
		ctx,
		customerId,
		customerProductId: customerProduct.id,
		updates: { status: CusProductStatus.PastDue },
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "threshold-billing-past-due",
	});
};
