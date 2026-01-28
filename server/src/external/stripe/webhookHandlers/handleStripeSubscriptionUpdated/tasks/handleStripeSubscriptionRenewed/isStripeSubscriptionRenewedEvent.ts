import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { notNullish, nullish } from "@/utils/genUtils";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";

export interface RenewalInfo {
	renewed: boolean;
	renewedAtMs: number;
}

/**
 * Detects if a subscription.updated event represents a renewal (un-cancellation).
 * A renewal occurs when a previously canceled subscription is un-canceled.
 */
export const isStripeSubscriptionRenewedEvent = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes?: SubscriptionPreviousAttributes;
}): RenewalInfo => {
	// If no previous attributes, we can't determine if this is a renewal
	if (!previousAttributes) {
		return { renewed: false, renewedAtMs: Date.now() };
	}
	// Un-canceled at period end
	const uncanceledAtPeriodEnd =
		previousAttributes.cancel_at_period_end &&
		!stripeSubscription.cancel_at_period_end;

	// cancel_at was set, now cleared
	const uncancelAt =
		notNullish(previousAttributes.cancel_at) &&
		nullish(stripeSubscription.cancel_at);

	// canceled_at was set (edge case)
	const uncanceledAt =
		notNullish(previousAttributes.canceled_at) &&
		stripeSubscription.canceled_at;

	return {
		renewed: !!(uncanceledAtPeriodEnd || uncancelAt || uncanceledAt),
		renewedAtMs: Date.now(),
	};
};
