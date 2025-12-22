import type { FullCustomer, FullProduct } from "@autumn/shared";
import {
	type CusProductActions,
	getOngoingCusProductById,
	getScheduledMainCusProductByGroup,
	isCusProductCanceled,
} from "@autumn/shared";

/**
 * Gets the actions for uncanceling a cus product.
 * @param fullCus - The full customer object.
 * @param product - The product object.
 * @returns The actions for uncanceling a cus product.
 */
export const getUncancelAttachActions = ({
	fullCus,
	product,
}: {
	fullCus: FullCustomer;
	product: FullProduct;
}): CusProductActions | undefined => {
	// 1. Get active cus product by ID:
	const ongoingSameCusProduct = getOngoingCusProductById({
		fullCus,
		productId: product.id,
	});

	if (
		!ongoingSameCusProduct ||
		!isCusProductCanceled({ cusProduct: ongoingSameCusProduct })
	) {
		return undefined;
	}

	// 1. Active cus product actions:
	const ongoingCusProductAction = {
		action: "uncancel" as const,
		cusProduct: ongoingSameCusProduct,
	};

	// 2. Scheduled cus product actions:
	const uncancellingMain = !product.is_add_on;
	const scheduledCusProduct = uncancellingMain
		? getScheduledMainCusProductByGroup({
				fullCus,
				productGroup: product.group,
			})
		: undefined;

	const scheduledCusProductAction = scheduledCusProduct
		? {
				action: "delete" as const,
				cusProduct: scheduledCusProduct,
			}
		: undefined;

	return {
		ongoingCustomerProduct: ongoingCusProductAction?.cusProduct,
		scheduledCusProductAction,
		newProductActions: [],
	};
};
