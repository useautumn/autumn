import {
	remainingDiscountMonths,
	type StripeDiscountWithCoupon,
	type SubscriptionRenewal,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { replacedSubscriptionPeriodEndMs } from "./replacedSubscriptionPeriodEndMs";

const DEFAULT_RENEWAL: SubscriptionRenewal = {
	interval: "month",
	intervalCount: 1,
};

const subscriptionRenewal = (
	subscription: Stripe.Subscription,
): SubscriptionRenewal => {
	const recurring = subscription.items.data.find(
		(item) => item.price?.recurring,
	)?.price.recurring;
	return recurring
		? { interval: recurring.interval, intervalCount: recurring.interval_count }
		: DEFAULT_RENEWAL;
};

/** Months a repeating discount on this subscription carries to a recreated one; the set_plans preview shows the same count. */
export const repeatingDiscountMonthsLeft = ({
	discount,
	subscription,
	currentEpochMs,
}: {
	discount: StripeDiscountWithCoupon;
	subscription: Stripe.Subscription;
	currentEpochMs: number;
}) => {
	const periodEndMs = replacedSubscriptionPeriodEndMs({
		replacedStripeSubscription: subscription,
	});
	if (!discount.end || periodEndMs === undefined) return 0;

	return remainingDiscountMonths({
		currentEpochMs,
		billingCycleAnchorMs: secondsToMs(subscription.billing_cycle_anchor),
		periodEndMs,
		renewal: subscriptionRenewal(subscription),
		discountEndMs: secondsToMs(discount.end),
	});
};
