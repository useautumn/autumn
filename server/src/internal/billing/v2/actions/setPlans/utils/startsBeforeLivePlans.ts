import {
	customerProductHasActiveStatus,
	type FullCustomer,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
	type StripeSubscriptionScope,
} from "@autumn/shared";
import { filterCustomerProductsInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

type LivePlansStartParams = {
	startsAt: number;
	fullCustomer: FullCustomer;
	stripeSubscriptionScope?: StripeSubscriptionScope;
};

const latestLivePlanStart = ({
	fullCustomer,
	stripeSubscriptionScope,
}: Omit<LivePlansStartParams, "startsAt">) => {
	const liveStarts = filterCustomerProductsInStripeSubscriptionScope({
		stripeSubscriptionScope,
		customerProducts: fullCustomer.customer_products,
	})
		.filter(customerProductHasActiveStatus)
		.map(({ starts_at }) => starts_at);
	return liveStarts.length > 0 ? Math.max(...liveStarts) : undefined;
};

/** Re-saving a schedule replays its started phase's date, which never predates any plan that phase runs. */
export const startsBeforeLivePlans = ({
	startsAt,
	...params
}: LivePlansStartParams) => {
	const latestStart = latestLivePlanStart(params);
	if (latestStart === undefined) return false;

	return latestStart - startsAt > SET_PLANS_FIRST_PHASE_TOLERANCE_MS;
};

/** Re-saving live plans sends back their own start. */
export const startsWithLivePlans = ({
	startsAt,
	...params
}: LivePlansStartParams) => {
	const latestStart = latestLivePlanStart(params);
	if (latestStart === undefined) return false;

	return Math.abs(latestStart - startsAt) <= SET_PLANS_FIRST_PHASE_TOLERANCE_MS;
};
