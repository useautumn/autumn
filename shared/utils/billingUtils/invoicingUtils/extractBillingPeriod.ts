import { InternalError } from "@api/errors/base/InternalError";
import { secondsToMs } from "@utils/common/unixUtils";
import type Stripe from "stripe";

/**
 * Extracts the current billing period from a Stripe subscription.
 *
 * Uses the first subscription item's period for accuracy with prorations and mid-cycle changes.
 *
 * @param stripeSubscription - Stripe subscription object
 * @returns Start and end timestamps in milliseconds
 * @throws {InternalError} When subscription has no items or invalid period timestamps
 */
export const extractBillingPeriod = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): {
	subscriptionPeriodStartEpochMs: number;
	subscriptionPeriodEndEpochMs: number;
} => {
	const firstSubscriptionItem = stripeSubscription.items.data[0];

	if (!firstSubscriptionItem) {
		throw new InternalError({
			message: "[Billing] Subscription has no items",
		});
	}

	const subscriptionPeriodStartEpochMs = secondsToMs(
		firstSubscriptionItem.current_period_start,
	);
	const subscriptionPeriodEndEpochMs = secondsToMs(
		firstSubscriptionItem.current_period_end,
	);

	if (!subscriptionPeriodStartEpochMs || !subscriptionPeriodEndEpochMs) {
		throw new InternalError({
			message: `[Billing] Invalid subscription period: start=${firstSubscriptionItem.current_period_start}, end=${firstSubscriptionItem.current_period_end}`,
		});
	}

	return {
		subscriptionPeriodStartEpochMs,
		subscriptionPeriodEndEpochMs,
	};
};
