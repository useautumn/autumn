import {
	customerProductEligibleForDefaultProduct,
	type FullCusProduct,
	type FullProduct,
	nullish,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getFreeDefaultProductByGroup } from "@/internal/customers/cusProducts/cusProductUtils";

export const setupDefaultProductContext = async ({
	ctx,
	params,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
}): Promise<FullProduct | undefined> => {
	if (nullish(params.cancel_action)) return undefined;

	const valid = customerProductEligibleForDefaultProduct({
		ctx,
		customerProduct,
	});

	if (!valid) return undefined;

	const defaultProduct = await getFreeDefaultProductByGroup({
		ctx,
		productGroup: customerProduct.product.group,
	});

	if (defaultProduct?.id === customerProduct.product.id) return undefined;

	return defaultProduct;
};
