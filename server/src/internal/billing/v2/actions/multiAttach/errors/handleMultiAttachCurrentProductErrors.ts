import {
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
	isOneOffProduct,
	type MultiAttachProductContext,
	RecaseError,
} from "@autumn/shared";

/**
 * Validates that none of the plans being attached conflict with existing customer products.
 * Multi-attach does not support product transitions, so any main recurring plan that
 * already has an active product in the same group is rejected.
 */
export const handleMultiAttachCurrentProductErrors = ({
	productContexts,
	fullCustomer,
}: {
	productContexts: MultiAttachProductContext[];
	fullCustomer: FullCustomer;
}) => {
	for (const productContext of productContexts) {
		const { fullProduct } = productContext;

		const isMainRecurring =
			!fullProduct.is_add_on &&
			!isOneOffProduct({ prices: fullProduct.prices });

		if (!isMainRecurring) continue;

		const currentCustomerProduct = findMainActiveCustomerProductByGroup({
			fullCus: fullCustomer,
			productGroup: fullProduct.group,
		});

		if (!currentCustomerProduct) continue;

		throw new RecaseError({
			message: `Plan "${fullProduct.id}" cannot be attached because the customer already has an active plan "${currentCustomerProduct.product.id}" in the same group "${fullProduct.group}". Multi-attach does not support plan transitions.`,
			statusCode: 400,
		});
	}
};
