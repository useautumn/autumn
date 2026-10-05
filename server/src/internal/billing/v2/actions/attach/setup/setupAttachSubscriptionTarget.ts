import {
	type AttachParamsV1,
	cp,
	type FullCusProduct,
	type FullCustomer,
	findActiveCustomerProductById,
} from "@autumn/shared";

/** The plan whose Stripe subscription the attach bills on. Same-group swaps use
 * the replaced plan. Cross-group swaps use the first paid plan removed via
 * remove_plan_ids, so the attached plan takes over that plan's subscription
 * instead of merging into an unrelated one. Otherwise undefined, and the
 * subscription lookup falls back to its usual ranking. */
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
