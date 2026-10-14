import {
	type AttachParamsV1,
	cp,
	type FullCusProduct,
	type FullCustomer,
	findActiveCustomerProductById,
} from "@autumn/shared";

export const setupAttachSubscriptionTarget = ({
	fullCustomer,
	params,
	currentCustomerProduct,
}: {
	fullCustomer: FullCustomer;
	params: AttachParamsV1;
	currentCustomerProduct?: FullCusProduct;
}): FullCusProduct | undefined => {
	if (currentCustomerProduct) return currentCustomerProduct;

	for (const productId of params.remove_plan_ids ?? []) {
		if (productId === params.plan_id) continue;

		const customerProduct = findActiveCustomerProductById({
			fullCus: fullCustomer,
			productId,
		});
		if (!customerProduct) continue;

		const billedOnSubscription = cp(customerProduct)
			.paidRecurring()
			.hasSubscription().valid;
		if (billedOnSubscription) return customerProduct;
	}

	return undefined;
};
