import {
	type FullCusProduct,
	type FullProduct,
	notNullish,
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
	if (nullish(params.cancel)) return undefined;

	// Add-ons don't trigger default products
	if (customerProduct.product.is_add_on) return undefined;

	if (notNullish(customerProduct.internal_entity_id)) return undefined;

	const defaultProduct = await getFreeDefaultProductByGroup({
		ctx,
		productGroup: customerProduct.product.group,
	});

	return defaultProduct;
};
