import {
	cp,
	type FullCusProduct,
	type FullProduct,
	nullish,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getFreeDefaultProductByGroup } from "@/internal/customers/cusProducts/cusProductUtils";

/**
 * Fetches the default product for cancel flows.
 * Only fetches when cancel is 'immediately' or 'end_of_cycle' and product is not an add-on.
 */
export const setupDefaultProductContext = async ({
	ctx,
	params,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV0Params;
	customerProduct: FullCusProduct;
}): Promise<FullProduct | undefined> => {
	// Only fetch if cancel is requested (not null/undefined)
	if (nullish(params.cancel_action)) return undefined;

	// Add-ons don't trigger default products
	const { valid: isMainAndCustomerScoped } = cp(customerProduct)
		.main()
		.customerScoped();

	if (!isMainAndCustomerScoped) return undefined;

	const defaultProduct = await getFreeDefaultProductByGroup({
		ctx,
		productGroup: customerProduct.product.group,
	});

	return defaultProduct;
};
