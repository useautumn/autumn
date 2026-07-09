import {
	type DbCustomerProduct,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";

/** Assignment never bills: a priced license must already be attached at the
 * customer level (normal billing.attach) before it can be assigned. Pure over
 * the effective product resolved upstream. */
export const validatePricedLicenseAttached = ({
	effectiveProduct,
	customerLevelProduct,
}: {
	effectiveProduct: FullProduct;
	customerLevelProduct?: DbCustomerProduct;
}) => {
	if (effectiveProduct.prices.length === 0) return;
	if (!customerLevelProduct) {
		throw new RecaseError({
			message: `License plan ${effectiveProduct.id} has priced items. Attach it to the customer with billing.attach before assigning.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
