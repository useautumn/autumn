import { type MultiAttachProductContext, RecaseError } from "@autumn/shared";

/**
 * Validates transition constraints for multi-attach:
 * 1. Cannot re-attach a product the customer already has (same product ID)
 * 2. At most one plan in the batch can trigger a transition (replace an existing product in the same group)
 */
export const handleMultiAttachCurrentProductErrors = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}) => {
	// 1. Block same-product re-attach
	for (const productContext of productContexts) {
		const { fullProduct, currentCustomerProduct } = productContext;

		if (!currentCustomerProduct) continue;

		if (currentCustomerProduct.product.id === fullProduct.id) {
			throw new RecaseError({
				message: `Cannot attach plan "${fullProduct.id}" because the customer already has this product active.`,
				statusCode: 400,
			});
		}
	}

	// 2. Block multiple transitions
	const transitioningProducts = productContexts.filter(
		(pc) => pc.currentCustomerProduct !== undefined,
	);

	if (transitioningProducts.length > 1) {
		const planIds = transitioningProducts
			.map((pc) => `"${pc.fullProduct.id}"`)
			.join(", ");
		throw new RecaseError({
			message: `Multi-attach supports at most one plan transition, but plans ${planIds} each replace an existing product in their group.`,
			statusCode: 400,
		});
	}
};
