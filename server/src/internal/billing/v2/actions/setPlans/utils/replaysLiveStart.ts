import {
	customerProductHasActiveStatus,
	type FullCustomer,
	filterCustomerProductsByStripeSubscriptionId,
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
	stripeSubscription,
	stripeSubscriptionScope,
}: LiveStartParams) => {
	const liveStarts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: filterCustomerProductsInStripeSubscriptionScope({
			stripeSubscriptionScope,
			customerProducts: fullCustomer.customer_products,
		}),
		stripeSubscriptionId: stripeSubscription.id,
	})
		.filter(customerProductHasActiveStatus)
		.map(({ starts_at }) => starts_at);
	return liveStarts.length > 0 ? Math.max(...liveStarts) : undefined;
};

/** A schedule's current phase can begin after its plans, when an earlier phase's plan ended. */
const schedulePhaseStart = ({
	stripeSubscription,
	stripeSubscriptionSchedule,
}: LiveStartParams) => {
	const currentPhaseStart =
		scheduleSubscriptionId(stripeSubscriptionSchedule) === stripeSubscription.id
			? stripeSubscriptionSchedule?.current_phase?.start_date
			: undefined;
	return currentPhaseStart ? secondsToMs(currentPhaseStart) : undefined;
};

/** Re-saving a live subscription sends back a start it runs from: its plans' own start, or its schedule phase's. */
export const replaysLiveStart = ({
	startsAt,
	...params
}: LiveStartParams & { startsAt: number }) =>
	[latestLivePlanStart(params), schedulePhaseStart(params)].some(
		(start) =>
			start !== undefined &&
			Math.abs(start - startsAt) <= SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
	);
