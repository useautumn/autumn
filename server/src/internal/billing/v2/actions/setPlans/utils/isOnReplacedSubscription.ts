import {
	type BillingContext,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";

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
