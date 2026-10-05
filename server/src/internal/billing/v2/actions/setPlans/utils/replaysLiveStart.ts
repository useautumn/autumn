import {
	customerProductHasActiveStatus,
	type FullCustomer,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
	type StripeSubscriptionScope,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { scheduleSubscriptionId } from "../setup/splitReplacedStripeSubscription";
import { filterCustomerProductsInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

type LiveStartParams = {
	fullCustomer: FullCustomer;
	stripeSubscription: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeSubscriptionScope?: StripeSubscriptionScope;
};

const latestLivePlanStart = ({
	fullCustomer,
	stripeSubscriptionScope,
}: LiveStartParams) => {
	const liveStarts = filterCustomerProductsInStripeSubscriptionScope({
		stripeSubscriptionScope,
		customerProducts: fullCustomer.customer_products,
	})
		.filter(customerProductHasActiveStatus)
		.map(({ starts_at }) => starts_at);
	return liveStarts.length > 0 ? Math.max(...liveStarts) : undefined;
};

/** A schedule's current phase can begin after its plans, when an earlier phase's plan ended. */
const liveStart = (params: LiveStartParams) => {
	const { stripeSubscription, stripeSubscriptionSchedule } = params;
	const currentPhaseStart =
		scheduleSubscriptionId(stripeSubscriptionSchedule) === stripeSubscription.id
			? stripeSubscriptionSchedule?.current_phase?.start_date
			: undefined;
	return currentPhaseStart
		? secondsToMs(currentPhaseStart)
		: latestLivePlanStart(params);
};

/** Re-saving a live subscription sends back the start it runs from. */
export const replaysLiveStart = ({
	startsAt,
	...params
}: LiveStartParams & { startsAt: number }) => {
	const start = liveStart(params);
	return (
		start !== undefined &&
		Math.abs(start - startsAt) <= SET_PLANS_FIRST_PHASE_TOLERANCE_MS
	);
};
