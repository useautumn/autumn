import {
	type BillingContext,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";

/** The row rides the subscription set_plans replaces, so the replacement subscription carries it. */
export const isOnReplacedStripeSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: Pick<BillingContext, "replacedStripeSubscription">;
	customerProduct: FullCusProduct;
}) => {
	const replacedSubscriptionId = billingContext.replacedStripeSubscription?.id;
	if (!replacedSubscriptionId) return false;

	return (
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: replacedSubscriptionId,
		}) === true
	);
};
