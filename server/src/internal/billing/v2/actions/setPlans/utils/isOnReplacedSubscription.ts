import {
	type BillingContext,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";

/** The row runs on the Stripe subscription this request replaces. */
export const isOnReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}) => {
	const replacedSubscriptionId = billingContext.replacedStripeSubscription?.id;
	return (
		replacedSubscriptionId !== undefined &&
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: replacedSubscriptionId,
		}) === true
	);
};
