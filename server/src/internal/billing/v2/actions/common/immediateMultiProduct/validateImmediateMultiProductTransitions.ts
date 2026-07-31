import { type MultiAttachProductContext, RecaseError } from "@autumn/shared";
import { validateProductGroupsByScope } from "../validateProductGroupsByScope";

/** Reject unsupported immediate multi-product transition combinations. */
export const validateImmediateMultiProductTransitions = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}) => {
	validateProductGroupsByScope({
		plans: productContexts.map((productContext) => ({
			fullProduct: productContext.fullProduct,
			scopeId: productContext.fullCustomer.entity?.internal_id,
		})),
		operation: "Multi-attach",
	});

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
};
