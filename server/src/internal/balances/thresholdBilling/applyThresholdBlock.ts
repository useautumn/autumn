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
 * check reads the cached subject, so a status write that skips the cache
 * leaves the block in place after payment — or lets usage through after a
 * failure. Both transitions go through here so neither can forget.
 */
export const applyThresholdBlock = async ({
	ctx,
	customerId,
	customerProducts,
	fullCustomer,
	status,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerProducts: FullCusProduct[];
	fullCustomer: FullCustomer;
	status: CusProductStatus.PastDue | CusProductStatus.Active;
	source: string;
}): Promise<void> => {
	if (customerProducts.length === 0) return;

	const transition =
		status === CusProductStatus.PastDue
			? customerProductActions.markPastDue
			: customerProductActions.markActive;

	for (const customerProduct of customerProducts) {
		await transition({ ctx, customerProduct, fullCustomer });
		await updateCachedCustomerProductV2({
			ctx,
			customerId,
			customerProductId: customerProduct.id,
			updates: { status },
		});
	}

	await deleteCachedFullCustomer({ ctx, customerId, source });
};
