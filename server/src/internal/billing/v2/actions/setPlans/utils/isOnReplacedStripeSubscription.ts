import {
	type BillingContext,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";

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
