import {
	customerProductHasActiveStatus,
	type FullCustomer,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
	type StripeSubscriptionScope,
} from "@autumn/shared";
import { filterCustomerProductsInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

/** Re-saving a schedule replays its started phase's date, which never predates any plan that phase runs. */
export const startsBeforeLivePlans = ({
	startsAt,
	fullCustomer,
	stripeSubscriptionScope,
}: {
	startsAt: number;
	fullCustomer: FullCustomer;
	stripeSubscriptionScope?: StripeSubscriptionScope;
}) => {
	const liveStarts = filterCustomerProductsInStripeSubscriptionScope({
		stripeSubscriptionScope,
		customerProducts: fullCustomer.customer_products,
	})
		.filter(customerProductHasActiveStatus)
		.map(({ starts_at }) => starts_at);
	if (liveStarts.length === 0) return false;

	return (
		Math.max(...liveStarts) - startsAt > SET_PLANS_FIRST_PHASE_TOLERANCE_MS
	);
};
