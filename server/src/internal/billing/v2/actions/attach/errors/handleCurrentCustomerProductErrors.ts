import {
    type AttachBillingContext,
    ErrCode,
    isCustomerProductPaid,
    RecaseError,
} from "@autumn/shared";

export const handleCurrentCustomerProductErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const {
		currentCustomerProduct,
		attachProduct,
		stripeSubscription,
		skipExternalPSPGuard,
	} = billingContext;

	if (currentCustomerProduct?.product.id === attachProduct.id) {
		throw new RecaseError({
			code: ErrCode.PlanAlreadyAttached,
			message: `Cannot attach because the customer's current product '${currentCustomerProduct.product.name}' is the same as the product being attached`,
			statusCode: 409,
		});
	}

	// The "paid but no Stripe sub" guard catches broken Stripe linkage.
	// External-PSP origin callers (e.g. RevenueCat) legitimately have paid
	// current products with no Stripe subscription — they opt out via
	// `skipExternalPSPGuard`. Stripe-origin cus_products with `processor: null`
	// must still be checked, so this is gated on the explicit flag rather than
	// on `cusProductToProcessorType`.
	if (
		!skipExternalPSPGuard &&
		isCustomerProductPaid(currentCustomerProduct) &&
		!stripeSubscription
	) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${currentCustomerProduct?.product.name}' is paid but no stripe subscription is linked to it`,
		});
	}
};
