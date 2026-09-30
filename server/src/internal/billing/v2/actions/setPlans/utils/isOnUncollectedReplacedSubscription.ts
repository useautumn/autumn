import {
	type BillingContext,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type Stripe from "stripe";

const UNCOLLECTED_STATUSES: Stripe.Subscription.Status[] = [
	"incomplete",
	"incomplete_expired",
	"unpaid",
	"paused",
];

/** Stripe never collected the replaced subscription's current period, so its plans have no unused time to credit. */
export const isOnUncollectedReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}) => {
	const { replacedStripeSubscription } = billingContext;
	if (!replacedStripeSubscription) return false;

	return (
		UNCOLLECTED_STATUSES.includes(replacedStripeSubscription.status) &&
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: replacedStripeSubscription.id,
		}) === true
	);
};
